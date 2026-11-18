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
from unittest import mock
import urllib.error
import urllib.parse
import urllib.request
import wave
from typing import Any, Dict, Optional, Tuple

STUDIO_DIR = Path(__file__).resolve().parent.parent
if str(STUDIO_DIR) not in sys.path:
    sys.path.insert(0, str(STUDIO_DIR))

import pipeline_automator
import pipeline_server


from tests.fixtures import make_prepped_track, make_render


class TestPipelineServerHelpers(unittest.TestCase):
    """Test helper logic: path sandboxing, name sanitization, report parsing."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.base_dir = Path(self.tmp.name).resolve()
        self.paths = pipeline_automator.PipelinePaths(self.base_dir)
        self.paths.ensure_dirs()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_is_safe_path_valid(self) -> None:
        safe, target = pipeline_server.is_safe_path(self.base_dir, "05_Mix_Renders/Venus_in_Versace_RoughMix.wav")
        self.assertTrue(safe)
        self.assertEqual(target, self.base_dir / "05_Mix_Renders" / "Venus_in_Versace_RoughMix.wav")

    def test_is_safe_path_traversal(self) -> None:
        safe, target = pipeline_server.is_safe_path(self.base_dir, "../../Windows/win.ini")
        self.assertFalse(safe)
        self.assertIsNone(target)

    def test_is_safe_path_absolute_outside(self) -> None:
        outside = Path(tempfile.gettempdir()).resolve().parent / "cmd.exe"
        safe, target = pipeline_server.is_safe_path(self.base_dir, str(outside))
        self.assertFalse(safe)
        self.assertIsNone(target)

    def test_sanitize_track_name(self) -> None:
        self.assertEqual(pipeline_server.sanitize_track_name("Venus in Versace"), "Venus_in_Versace")
        self.assertEqual(pipeline_server.sanitize_track_name("Chasing Harmony.wav"), "Chasing_Harmony")
        self.assertEqual(pipeline_server.sanitize_track_name("From the Depths ext v1.2.2"), "From_the_Depths_ext_v1_2_2")
        self.assertEqual(pipeline_server.sanitize_track_name("Glowing Coal (Cover) (1)"), "Glowing_Coal_Cover_1")
        self.assertEqual(pipeline_server.sanitize_track_name("The Corrs - What Can I Do _ Aisling, Dub 4"), "The_Corrs_What_Can_I_Do_Aisling_Dub_4")
        self.assertEqual(pipeline_server.sanitize_track_name("Don't Stop');alert(1)//"), "Don_t_Stop_alert_1")

    def test_parse_mix_qa_report_roundtrip(self) -> None:
        wav = make_render(self.paths, "Song_RoughMix")
        report = pipeline_automator.write_qa_report(wav, ffmpeg_bin="definitely-not-ffmpeg")
        qa = pipeline_server.parse_mix_qa_report(report)
        self.assertEqual(qa["loudness_method"], "built-in BS.1770 meter")
        self.assertIsNotNone(qa["integrated_lufs"])
        self.assertIsNotNone(qa["true_peak_dbtp"])
        self.assertEqual(len(qa["bands"]), 5)
        self.assertGreaterEqual(len(qa["fixes"]), 1)
        for fix in qa["fixes"]:
            self.assertEqual(set(fix), {"timestamp", "element", "issue", "move"})

    def test_has_pending_work_idle(self) -> None:
        self.assertIsNone(pipeline_server.has_pending_work(self.paths))

    def test_renders_match_exact_track_names(self) -> None:
        """'Song' must not pick up 'Song2' renders (old prefix-glob bug)."""
        make_render(self.paths, "Song2_RoughMix")
        make_render(self.paths, "Song_Humanized")
        self.assertEqual([p.name for p in pipeline_automator.renders_for_track(self.paths, "Song")], ["Song_Humanized.wav"])
        self.assertEqual([p.name for p in pipeline_automator.renders_for_track(self.paths, "Song2")], ["Song2_RoughMix.wav"])

    def test_failed_step_is_not_retried_until_inputs_change(self) -> None:
        stems = self.paths.stems / "Broken"
        stems.mkdir(parents=True)
        wav = make_render(self.paths, "tmp")
        target = stems / "Broken_drums.wav"
        wav.replace(target)
        self.assertEqual(pipeline_server.has_pending_work(self.paths), "Running Stem Prep...")

        # stem_prep.py is missing -> failure is recorded, not retried every poll
        pipeline_automator.run_stem_prep(self.paths, stem_prep_path=self.base_dir / "missing.py")
        self.assertIsNone(pipeline_server.has_pending_work(self.paths))
        tracks = {t["name"]: t for t in pipeline_server.discover_tracks(self.paths)["tracks"]}
        self.assertEqual(tracks["Broken"]["status"], "Failed: Stem prep")
        self.assertIn("missing.py", tracks["Broken"]["failures"][0]["error"])

        # Touching the input makes it eligible again
        os.utime(target, ns=(time.time_ns(), time.time_ns() + 5_000_000_000))
        self.assertEqual(pipeline_server.has_pending_work(self.paths), "Running Stem Prep...")

    def test_invalidate_track_outputs_removes_stale_mixes(self) -> None:
        td = make_prepped_track(self.paths, "Track", seconds=4.0)
        (td / "MIDI").mkdir()
        (td / "MIDI" / ".midi_done").write_text("x")
        for stem in ("Track_RoughMix", "Track_Humanized"):
            w = make_render(self.paths, stem, seconds=1.0)
            pipeline_automator.qa_report_path(w).write_text("report")
        keep = make_render(self.paths, "Track_Master", seconds=1.0)  # the user's own export stays

        pipeline_server.invalidate_track_outputs(self.paths, "Track")
        self.assertFalse((td / ".done").exists())
        self.assertFalse((td / "MIDI" / ".midi_done").exists())
        self.assertFalse((self.paths.renders / "Track_RoughMix.wav").exists())
        self.assertFalse((self.paths.renders / "Track_Humanized_Mix_QA_Report.md").exists())
        self.assertTrue(keep.exists())


class TestPipelineServerHTTP(unittest.TestCase):
    """Integration tests executing live HTTP requests against a temp pipeline."""

    server: pipeline_server.ThreadingHTTPServer
    server_thread: threading.Thread
    base_url: str

    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        cls.paths = pipeline_automator.PipelinePaths(Path(cls.tmp.name))
        cls.paths.ensure_dirs()
        make_prepped_track(cls.paths, "Venus_in_Versace", seconds=6.0)
        cls.render = make_render(cls.paths, "Venus_in_Versace_RoughMix", seconds=4.0)
        pipeline_automator.write_qa_report(cls.render, ffmpeg_bin="definitely-not-ffmpeg")

        pipeline_server.PipelineRequestHandler.server_paths = cls.paths
        pipeline_server.PipelineRequestHandler.ffmpeg_bin = "ffmpeg"
        pipeline_server.ThreadingHTTPServer.allow_reuse_address = True
        cls.server = pipeline_server.ThreadingHTTPServer(("127.0.0.1", 0), pipeline_server.PipelineRequestHandler)
        port = cls.server.server_address[1]
        cls.base_url = f"http://127.0.0.1:{port}"
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    def _post(self, path: str, body: Any, headers: Optional[Dict[str, str]] = None) -> Tuple[int, Dict[str, Any]]:
        data = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(f"{self.base_url}{path}", data=data,
                                     headers=headers if headers is not None else {"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            return err.code, json.loads(err.read().decode("utf-8") or "{}")

    def test_get_root_serves_html(self) -> None:
        with urllib.request.urlopen(f"{self.base_url}/") as resp:
            self.assertEqual(resp.status, HTTPStatus.OK)
            self.assertIn("text/html", resp.headers.get("Content-Type", ""))
            body = resp.read().decode("utf-8")
            self.assertIn("SUNO", body)
            self.assertIn("FL STUDIO", body)
            self.assertIsNone(resp.headers.get("Access-Control-Allow-Origin"))

    def test_ml_studio_opens_independent_working_copies(self) -> None:
        track = "ML Session"
        project = self.paths.fl_project / track / f"{track}.flp"
        project.parent.mkdir()
        project.write_bytes(b"original")
        with mock.patch.object(pipeline_server, "ml_studio_executable", return_value="/opt/ML Studio"), \
             mock.patch.object(subprocess, "Popen") as launch:
            for _ in range(2):
                status, _ = self._post("/api/open-ml-studio", {"track": track})
                self.assertEqual(status, HTTPStatus.OK)
            copies = [Path(call.args[0][1]) for call in launch.call_args_list]
        self.assertNotEqual(*copies)
        for copy in copies:
            self.assertEqual(copy.parent, project.parent)
            self.assertNotEqual(copy, project)
            self.assertEqual(copy.read_bytes(), b"original")

    def test_export_requires_a_render_from_selected_track(self) -> None:
        status, _ = self._post("/api/export-video", {"track": "Different", "render": self.render.name,
                                                     "orientation": "landscape"})
        self.assertEqual(status, HTTPStatus.NOT_FOUND)
        status, _ = self._post("/api/export-video", {"track": "Venus_in_Versace", "render": self.render.name,
                                                     "orientation": "square"})
        self.assertEqual(status, HTTPStatus.BAD_REQUEST)

    def test_get_favicon_returns_no_content(self) -> None:
        with urllib.request.urlopen(f"{self.base_url}/favicon.ico") as resp:
            self.assertEqual(resp.status, HTTPStatus.NO_CONTENT)

    def test_get_status_json(self) -> None:
        with urllib.request.urlopen(f"{self.base_url}/api/status") as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for key in ("watcher_running", "pid", "preset", "counts", "logs", "auto_humanize", "queued_jobs"):
            self.assertIn(key, data)
        self.assertIsInstance(data["counts"], dict)

    def test_get_tracks_discovers_fixture_track(self) -> None:
        with urllib.request.urlopen(f"{self.base_url}/api/tracks") as resp:
            data = json.loads(resp.read().decode("utf-8"))
        venus = next((t for t in data["tracks"] if t["name"] == "Venus_in_Versace"), None)
        self.assertIsNotNone(venus)
        self.assertEqual(venus["status"], "Mix Rendered & Audited")
        self.assertEqual(len(venus["prepped_stems"]), 4)
        self.assertEqual(len(venus["drum_triggers"]), 3)
        self.assertEqual(venus["mix_qa"]["render_kind"], "rough")
        self.assertIsNotNone(venus["mix_qa"]["integrated_lufs"])
        self.assertEqual(venus["humanize"]["drums_mode"], "replace")

    def test_audio_streaming_range_and_full(self) -> None:
        url = f"{self.base_url}/api/audio?path={urllib.parse.quote('05_Mix_Renders/Venus_in_Versace_RoughMix.wav')}"
        with urllib.request.urlopen(url) as resp:
            self.assertEqual(resp.status, HTTPStatus.OK)
            self.assertEqual(resp.headers.get("Accept-Ranges"), "bytes")
            self.assertEqual(int(resp.headers.get("Content-Length", "0")), self.render.stat().st_size)
        req = urllib.request.Request(url, headers={"Range": "bytes=0-1023"})
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, HTTPStatus.PARTIAL_CONTENT)
            self.assertEqual(resp.headers.get("Content-Length"), "1024")
            self.assertTrue(resp.headers.get("Content-Range", "").startswith("bytes 0-1023/"))
            self.assertEqual(len(resp.read()), 1024)

    def test_audio_streaming_traversal_blocked(self) -> None:
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(f"{self.base_url}/api/audio?path=../../Windows/win.ini")
        self.assertEqual(ctx.exception.code, HTTPStatus.FORBIDDEN)

    def test_post_watcher_toggle(self) -> None:
        status, data = self._post("/api/watcher", {"running": False, "preset": "bright-tame"})
        self.assertEqual(status, HTTPStatus.OK)
        self.assertFalse(data["watcher_running"])
        self.assertEqual(data["preset"], "bright-tame")
        status, _ = self._post("/api/watcher", {"running": True, "preset": "gentle"})
        self.assertEqual(status, HTTPStatus.OK)

    # --- security -----------------------------------------------------------

    def test_cross_origin_post_is_blocked(self) -> None:
        before = pipeline_server.WATCHER_ENABLED
        status, _ = self._post("/api/watcher", {"running": not before},
                               headers={"Content-Type": "application/json", "Origin": "https://evil.example"})
        self.assertEqual(status, HTTPStatus.FORBIDDEN)
        self.assertEqual(pipeline_server.WATCHER_ENABLED, before)

    def test_same_origin_post_is_allowed(self) -> None:
        host = self.base_url.split("//")[1]
        status, _ = self._post("/api/watcher", {"preset": "gentle"},
                               headers={"Content-Type": "application/json", "Origin": f"http://{host}"})
        self.assertEqual(status, HTTPStatus.OK)

    def test_text_plain_post_is_rejected(self) -> None:
        """A cross-site 'simple' request (no CORS preflight) must not reach the API."""
        status, _ = self._post("/api/run-once", b'{"preset":"gentle"}', headers={"Content-Type": "text/plain"})
        self.assertEqual(status, HTTPStatus.UNSUPPORTED_MEDIA_TYPE)
        status, _ = self._post("/api/upload?target=inbox&filename=x.wav", b"RIFF", headers={"Content-Type": "text/plain"})
        self.assertEqual(status, HTTPStatus.UNSUPPORTED_MEDIA_TYPE)

    def test_foreign_host_header_is_rejected(self) -> None:
        """DNS rebinding: a page on attacker.com resolving to 127.0.0.1 sends Host: attacker.com."""
        req = urllib.request.Request(f"{self.base_url}/api/tracks", headers={"Host": "attacker.example:8765"})
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code, HTTPStatus.FORBIDDEN)

    def test_track_parameter_rejects_paths(self) -> None:
        status, _ = self._post("/api/reprocess", {"track": "../../etc"})
        self.assertEqual(status, HTTPStatus.BAD_REQUEST)

    def test_ui_has_no_inline_handlers_with_interpolated_names(self) -> None:
        """Track names must never be pasted into inline JS (old XSS / apostrophe bug)."""
        html = (STUDIO_DIR / "ui" / "index.html").read_text(encoding="utf-8")
        self.assertNotRegex(html, r"on(click|change)=\"[^\"]*\$\{")


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
        backups = list(stems_dir.glob(".previous-stems-*/My_Band_vocals.wav"))
        self.assertEqual([p.read_bytes() for p in backups], [b"old_vox"])
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
        (s4_prep / "track_metadata.json").write_text("{}")

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
        (s3_prep / "track_metadata.json").write_text("{}")
        self.assertEqual(
            pipeline_server.has_pending_work(self.paths),
            "Generating Rough Mix & QA for Stage3...",
        )


if __name__ == "__main__":
    unittest.main()
