#!/usr/bin/env python3
"""Unit and integration tests for the Suno Music Pipeline Studio Server."""

from __future__ import annotations

import base64
from http import HTTPStatus
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
import wave

STUDIO_DIR = Path(__file__).resolve().parent.parent
if str(STUDIO_DIR) not in sys.path:
    sys.path.insert(0, str(STUDIO_DIR))

import pipeline_automator
import pipeline_server


class TestPipelineServerHelpers(unittest.TestCase):
    """Test helper logic: path sandboxing, name sanitization, report parsing."""

    def setUp(self) -> None:
        self.base_dir = Path("C:/Music_Pipeline").resolve()

    def test_is_safe_path_valid(self) -> None:
        safe, target = pipeline_server.is_safe_path(self.base_dir, "05_Mix_Renders/Venus_in_Versace_RoughMix.wav")
        self.assertTrue(safe)
        self.assertIsNotNone(target)
        self.assertEqual(target, self.base_dir / "05_Mix_Renders" / "Venus_in_Versace_RoughMix.wav")

    def test_is_safe_path_traversal(self) -> None:
        safe, target = pipeline_server.is_safe_path(self.base_dir, "../../Windows/win.ini")
        self.assertFalse(safe)
        self.assertIsNone(target)

    def test_is_safe_path_absolute_outside(self) -> None:
        safe, target = pipeline_server.is_safe_path(self.base_dir, "C:/Windows/System32/cmd.exe")
        self.assertFalse(safe)
        self.assertIsNone(target)

    def test_sanitize_track_name(self) -> None:
        self.assertEqual(pipeline_server.sanitize_track_name("Venus in Versace"), "Venus_in_Versace")
        self.assertEqual(pipeline_server.sanitize_track_name("Chasing Harmony.wav"), "Chasing_Harmony")
        self.assertEqual(pipeline_server.sanitize_track_name("From the Depths ext v1.2.2"), "From_the_Depths_ext_v1_2_2")
        self.assertEqual(pipeline_server.sanitize_track_name("Glowing Coal (Cover) (1)"), "Glowing_Coal_Cover_1")
        self.assertEqual(pipeline_server.sanitize_track_name("The Corrs - What Can I Do _ Aisling, Dub 4"), "The_Corrs_What_Can_I_Do_Aisling_Dub_4")

    def test_parse_mix_qa_report(self) -> None:
        report_path = self.base_dir / "05_Mix_Renders" / "Venus_in_Versace_RoughMix_Mix_QA_Report.md"
        if not report_path.is_file():
            self.skipTest(f"Report file {report_path} not found")

        qa = pipeline_server.parse_mix_qa_report(report_path)
        self.assertIsNotNone(qa)
        self.assertEqual(qa.get("integrated_lufs"), -26.4)
        self.assertEqual(qa.get("true_peak_dbtp"), -14.0)
        self.assertEqual(qa.get("crest_factor_db"), 14.7)
        self.assertEqual(qa.get("lra_lu"), 3.9)
        self.assertGreaterEqual(len(qa.get("bands", [])), 5)
        self.assertGreaterEqual(len(qa.get("fixes", [])), 4)

        # Check fix structure
        first_fix = qa["fixes"][0]
        self.assertIn("timestamp", first_fix)
        self.assertIn("element", first_fix)
        self.assertIn("issue", first_fix)
        self.assertIn("move", first_fix)

    def test_has_pending_work_idle(self) -> None:
        paths = pipeline_automator.PipelinePaths(self.base_dir)
        # When all tracks are up to date and inbox empty, has_pending_work returns None
        self.assertIsNone(pipeline_server.has_pending_work(paths))


class TestPipelineServerHTTP(unittest.TestCase):
    """Integration test suite executing live HTTP requests against PipelineRequestHandler."""

    server: pipeline_server.ThreadingHTTPServer
    server_thread: threading.Thread
    base_url: str

    @classmethod
    def setUpClass(cls) -> None:
        base_dir = Path("C:/Music_Pipeline").resolve()
        paths = pipeline_automator.PipelinePaths(base_dir)

        # Bind to ephemeral port
        pipeline_server.PipelineRequestHandler.server_paths = paths
        pipeline_server.PipelineRequestHandler.ffmpeg_bin = "ffmpeg"
        pipeline_server.ThreadingHTTPServer.allow_reuse_address = True
        cls.server = pipeline_server.ThreadingHTTPServer(("127.0.0.1", 0), pipeline_server.PipelineRequestHandler)
        port = cls.server.server_address[1]
        cls.base_url = f"http://127.0.0.1:{port}"

        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        time.sleep(0.3)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()

    def test_get_root_serves_html(self) -> None:
        req = urllib.request.Request(f"{self.base_url}/")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, HTTPStatus.OK)
            self.assertIn("text/html", resp.headers.get("Content-Type", ""))
            body = resp.read().decode("utf-8")
            self.assertIn("SUNO", body)
            self.assertIn("FL STUDIO", body)

    def test_get_favicon_returns_no_content(self) -> None:
        req = urllib.request.Request(f"{self.base_url}/favicon.ico")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, HTTPStatus.NO_CONTENT)

    def test_get_status_json(self) -> None:
        req = urllib.request.Request(f"{self.base_url}/api/status")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, HTTPStatus.OK)
            self.assertIn("application/json", resp.headers.get("Content-Type", ""))
            data = json.loads(resp.read().decode("utf-8"))
            self.assertIn("watcher_running", data)
            self.assertIn("pid", data)
            self.assertIn("preset", data)
            self.assertIn("counts", data)
            self.assertIn("logs", data)
            self.assertIsInstance(data["counts"], dict)
            self.assertIsInstance(data["logs"], list)

    def test_get_tracks_discovers_venus_in_versace(self) -> None:
        req = urllib.request.Request(f"{self.base_url}/api/tracks")
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, HTTPStatus.OK)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertIn("tracks", data)
            self.assertIn("available_rendered", data)
            tracks = data["tracks"]

            venus = next((t for t in tracks if t["name"] == "Venus_in_Versace"), None)
            self.assertIsNotNone(venus, "Venus_in_Versace must be discovered in tracks list")
            self.assertIn(venus["status"], ("Mix Rendered & Audited", "Prepped & Ready"))
            self.assertGreaterEqual(len(venus["source_stems"]), 4)
            self.assertGreaterEqual(len(venus["prepped_stems"]), 4)
            self.assertGreaterEqual(len(venus["drum_triggers"]), 3)
            self.assertGreaterEqual(len(venus["midi_files"]), 2)
            self.assertTrue(venus["fl_project"]["exists"])
            self.assertIsNotNone(venus["mix_qa"])
            self.assertEqual(venus["mix_qa"]["integrated_lufs"], -26.4)

    def test_audio_streaming_range_and_full(self) -> None:
        rel_path = "05_Mix_Renders/Venus_in_Versace_RoughMix.wav"

        # 1. Full content request (no Range header) -> 200 OK
        req_full = urllib.request.Request(f"{self.base_url}/api/audio?path={urllib.parse.quote(rel_path)}")
        with urllib.request.urlopen(req_full) as resp:
            self.assertEqual(resp.status, HTTPStatus.OK)
            self.assertEqual(resp.headers.get("Content-Type"), "audio/wav")
            self.assertEqual(resp.headers.get("Accept-Ranges"), "bytes")
            total_len = int(resp.headers.get("Content-Length", "0"))
            self.assertGreater(total_len, 1000000)

        # 2. Byte Range request -> 206 Partial Content
        req_range = urllib.request.Request(f"{self.base_url}/api/audio?path={urllib.parse.quote(rel_path)}")
        req_range.add_header("Range", "bytes=0-1023")
        with urllib.request.urlopen(req_range) as resp:
            self.assertEqual(resp.status, HTTPStatus.PARTIAL_CONTENT)
            self.assertEqual(resp.headers.get("Content-Type"), "audio/wav")
            self.assertEqual(resp.headers.get("Content-Length"), "1024")
            self.assertTrue(resp.headers.get("Content-Range", "").startswith("bytes 0-1023/"))
            chunk = resp.read()
            self.assertEqual(len(chunk), 1024)

    def test_audio_streaming_traversal_blocked(self) -> None:
        # Path traversal should return 403 Forbidden
        req = urllib.request.Request(f"{self.base_url}/api/audio?path=../../Windows/win.ini")
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code, HTTPStatus.FORBIDDEN)

    def test_post_watcher_toggle(self) -> None:
        body = json.dumps({"running": False, "preset": "bright-tame"}).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/api/watcher",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, HTTPStatus.OK)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["status"], "ok")
            self.assertFalse(data["watcher_running"])
            self.assertEqual(data["preset"], "bright-tame")

        # Restore watcher
        body_restore = json.dumps({"running": True, "preset": "gentle"}).encode("utf-8")
        req_restore = urllib.request.Request(
            f"{self.base_url}/api/watcher",
            data=body_restore,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req_restore) as resp:
            self.assertEqual(resp.status, HTTPStatus.OK)


class TestUploadAndDiscoveryDirectives(unittest.TestCase):
    """Test raw binary upload, multi-format transcoding, marker invalidation, and stage discovery."""

    def _make_wav_bytes(self, duration_sec: float = 0.25, sr: int = 24000) -> bytes:
        buf = io.BytesIO()
        num_frames = int(sr * duration_sec)
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(b"\x00\x00" * num_frames)
        return buf.getvalue()

    def setUp(self) -> None:
        self.tmp_dir = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.tmp_dir.name).resolve()
        self.paths = pipeline_automator.PipelinePaths(self.base_dir)
        self.paths.ensure_dirs()

        self._orig_paths = getattr(pipeline_server.PipelineRequestHandler, "server_paths", None)
        self._orig_ffmpeg = getattr(pipeline_server.PipelineRequestHandler, "ffmpeg_bin", "ffmpeg")
        pipeline_server.PipelineRequestHandler.server_paths = self.paths
        pipeline_server.PipelineRequestHandler.ffmpeg_bin = "ffmpeg"
        pipeline_server.ThreadingHTTPServer.allow_reuse_address = True
        self.server = pipeline_server.ThreadingHTTPServer(("127.0.0.1", 0), pipeline_server.PipelineRequestHandler)
        self.base_url = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        if self._orig_paths is not None:
            pipeline_server.PipelineRequestHandler.server_paths = self._orig_paths
        pipeline_server.PipelineRequestHandler.ffmpeg_bin = self._orig_ffmpeg
        self.tmp_dir.cleanup()

    def test_raw_binary_wav_upload_and_solitary_invalidation(self) -> None:
        track = "My_Song"
        # Pre-populate existing stems, done markers, and QA report
        stems_dir = self.paths.stems / track
        stems_dir.mkdir(parents=True, exist_ok=True)
        (stems_dir / f"{track}_vocals.wav").write_bytes(b"old")
        prep_dir = self.paths.prepped / track
        (prep_dir / "MIDI").mkdir(parents=True, exist_ok=True)
        (prep_dir / ".done").write_text("done")
        (prep_dir / "MIDI" / ".midi_done").write_text("midi")
        qa_report = self.paths.renders / f"{track}_RoughMix_Mix_QA_Report.md"
        qa_report.write_text("# old report")

        wav_bytes = self._make_wav_bytes()
        url = f"{self.base_url}/api/upload?target=inbox&filename={urllib.parse.quote(track + '.wav')}"
        req = urllib.request.Request(
            url,
            data=wav_bytes,
            headers={"Content-Type": "application/octet-stream"},
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, HTTPStatus.OK)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["track"], track)
            self.assertEqual(data["filename"], f"{track}.wav")

        self.assertTrue((self.paths.inbox / f"{track}.wav").is_file())
        self.assertEqual(list(stems_dir.glob("*.wav")), [])
        self.assertFalse((prep_dir / ".done").exists())
        self.assertFalse((prep_dir / "MIDI" / ".midi_done").exists())
        self.assertFalse(qa_report.exists())

    def test_mp3_transcode_upload_and_grouped_stem_invalidation(self) -> None:
        wav_bytes = self._make_wav_bytes(duration_sec=0.3)
        with tempfile.TemporaryDirectory() as src_tmp:
            wav_in = Path(src_tmp) / "in.wav"
            mp3_in = Path(src_tmp) / "My_Band_vocals.mp3"
            wav_in.write_bytes(wav_bytes)
            res = subprocess.run(
                ["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-i", str(wav_in), str(mp3_in)],
                capture_output=True,
                check=False,
            )
            if res.returncode != 0:
                self.skipTest("ffmpeg mp3 encoder unavailable")
            mp3_bytes = mp3_in.read_bytes()

        # Pre-populate grouped stems & sibling stem in moises
        stems_dir = self.paths.stems / "My_Band"
        stems_dir.mkdir(parents=True, exist_ok=True)
        (stems_dir / "My_Band_vocals.wav").write_bytes(b"old_vox")
        (stems_dir / "My_Band_drums.wav").write_bytes(b"keep_drums")
        prep_dir = self.paths.prepped / "My_Band"
        (prep_dir / "MIDI").mkdir(parents=True, exist_ok=True)
        (prep_dir / ".done").write_text("done")
        (prep_dir / "MIDI" / ".midi_done").write_text("midi")

        url = f"{self.base_url}/api/upload?target=inbox&filename={urllib.parse.quote('My_Band_vocals.mp3')}"
        req = urllib.request.Request(
            url,
            data=mp3_bytes,
            headers={"Content-Type": "audio/mpeg"},
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, HTTPStatus.OK)
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["track"], "My_Band")
            self.assertEqual(data["filename"], "My_Band_vocals.wav")

        promoted = self.paths.inbox / "My_Band_vocals.wav"
        self.assertTrue(promoted.is_file())
        with wave.open(str(promoted), "rb") as wf:
            self.assertEqual(wf.getsampwidth(), 3)  # 24-bit PCM
        self.assertFalse((stems_dir / "My_Band_vocals.wav").exists())
        self.assertTrue((stems_dir / "My_Band_drums.wav").exists())
        self.assertFalse((prep_dir / ".done").exists())
        self.assertFalse((prep_dir / "MIDI" / ".midi_done").exists())

    def test_backward_compatible_json_base64_and_moises_renders_targets(self) -> None:
        wav_bytes = self._make_wav_bytes()
        # Moises upload preserves sibling stems
        stems_dir = self.paths.stems / "TrackA"
        stems_dir.mkdir(parents=True, exist_ok=True)
        (stems_dir / "TrackA_bass.wav").write_bytes(b"sibling")
        prep_dir = self.paths.prepped / "TrackA"
        (prep_dir / "MIDI").mkdir(parents=True, exist_ok=True)
        (prep_dir / ".done").write_text("done")
        (prep_dir / "MIDI" / ".midi_done").write_text("midi")

        payload = json.dumps({
            "target": "moises",
            "track": "TrackA",
            "filename": "TrackA_vocals.wav",
            "data_base64": base64.b64encode(wav_bytes).decode("ascii"),
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/api/upload",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["track"], "TrackA")
        self.assertTrue((stems_dir / "TrackA_bass.wav").exists())
        self.assertTrue((stems_dir / "TrackA_vocals.wav").is_file())
        self.assertFalse((prep_dir / ".done").exists())
        self.assertFalse((prep_dir / "MIDI" / ".midi_done").exists())

        # Renders target strips _RoughMix/_Mix/_Master and invalidates QA report
        old_qa = self.paths.renders / "TrackA_RoughMix_Mix_QA_Report.md"
        old_qa.write_text("old")
        req2 = urllib.request.Request(
            f"{self.base_url}/api/upload?target=renders&filename=TrackA_RoughMix.wav",
            data=wav_bytes,
            headers={"Content-Type": "application/octet-stream"},
            method="POST",
        )
        with urllib.request.urlopen(req2) as resp2:
            data2 = json.loads(resp2.read().decode("utf-8"))
            self.assertEqual(data2["track"], "TrackA")
        self.assertFalse(old_qa.exists())

    def test_upload_rejects_invalid_extension(self) -> None:
        req = urllib.request.Request(
            f"{self.base_url}/api/upload?target=inbox&filename=script.exe",
            data=b"MZ",
            headers={"Content-Type": "application/octet-stream"},
            method="POST",
        )
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code, HTTPStatus.BAD_REQUEST)

    def test_discover_tracks_live_stages_and_pending_rough_mix(self) -> None:
        # 1. Inbox only -> Splitting Stems (Demucs)...
        (self.paths.inbox / "Stage1.wav").write_bytes(b"wav")
        (self.paths.inbox / ".upload_hidden.tmp.wav").write_bytes(b"tmp")

        # 2. Stems present -> Prepping Stems...
        (self.paths.stems / "Stage2").mkdir(parents=True)
        (self.paths.stems / "Stage2" / "Stage2_drums.wav").write_bytes(b"wav")

        # 3. .done present -> Generating MIDI... & triggers 5th check in has_pending_work
        s3_prep = self.paths.prepped / "Stage3"
        (s3_prep / "Audio_Stems").mkdir(parents=True)
        (s3_prep / "Audio_Stems" / "Stage3_drums_prep.wav").write_bytes(b"wav")
        (s3_prep / ".done").write_text("done")

        # 4. .midi_done present -> Prepped & Ready
        s4_prep = self.paths.prepped / "Stage4"
        (s4_prep / "MIDI").mkdir(parents=True)
        (s4_prep / ".done").write_text("done")
        (s4_prep / "MIDI" / ".midi_done").write_text("midi")

        discovered = pipeline_server.discover_tracks(self.paths)
        by_name = {t["name"]: t for t in discovered["tracks"]}

        self.assertIn("Stage1", by_name)
        self.assertNotIn(".upload_hidden.tmp", by_name)
        self.assertEqual(by_name["Stage1"]["status"], "Splitting Stems (Demucs)...")
        self.assertEqual(by_name["Stage2"]["status"], "Prepping Stems...")
        self.assertEqual(by_name["Stage3"]["status"], "Generating MIDI...")
        self.assertEqual(by_name["Stage4"]["status"], "Prepped & Ready")

        # Verify 5th check in has_pending_work when stages 1-4 are satisfied
        (self.paths.inbox / "Stage1.wav").unlink()
        (self.paths.stems / "Stage2" / "Stage2_drums.wav").unlink()
        (s3_prep / "MIDI").mkdir(parents=True)
        (s3_prep / "MIDI" / ".midi_done").write_text("midi")
        self.assertEqual(
            pipeline_server.has_pending_work(self.paths),
            "Generating Rough Mix & QA for Stage3...",
        )


if __name__ == "__main__":
    unittest.main()
