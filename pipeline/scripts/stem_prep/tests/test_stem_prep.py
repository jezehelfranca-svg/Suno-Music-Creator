import io
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

import stem_prep as sp

FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")


def setUpModule():
    # Keep test output quiet; assertLogs attaches its own handler to this logger.
    logging.getLogger("stem_prep").propagate = False
    logging.getLogger("stem_prep").addHandler(logging.NullHandler())


def _touch_wav(path: Path, data: bytes = b"RIFF0000WAVE") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


class FakeRunner:
    """Records commands; creates the output file; fails when output name matches."""

    def __init__(self, fail_substr=None, raise_exc=None):
        self.calls = []
        self.fail_substr = fail_substr
        self.raise_exc = raise_exc

    def __call__(self, cmd, **kwargs):
        self.calls.append((cmd, kwargs))
        if self.raise_exc:
            raise self.raise_exc
        out = Path(cmd[-1])
        out.write_bytes(b"x")
        if self.fail_substr and self.fail_substr in out.name:
            return subprocess.CompletedProcess(cmd, 1, "", "Error: boom\nInvalid data")
        return subprocess.CompletedProcess(cmd, 0, "", "")


class TestClassification(unittest.TestCase):
    def test_kinds(self):
        cases = {
            "Vocals.wav": "vocals", "lead_vox.WAV": "vocals", "Backing Voice.wav": "vocals",
            "Drums.wav": "drums", "kick.wav": "drums", "Percussion.wav": "drums",
            "Bass.wav": "bass", "808.wav": "bass",
            "Other.wav": "other", "Guitar.wav": "other", "Piano.wav": "other",
        }
        for name, kind in cases.items():
            with self.subTest(name=name):
                self.assertEqual(sp.classify_stem(name), kind)

    def test_bass_drum_is_drums(self):
        self.assertEqual(sp.classify_stem("Bass Drum.wav"), "drums")

    def test_source_wav_matching_case_insensitive(self):
        self.assertTrue(sp.is_source_wav("Vocals.WAV"))
        self.assertTrue(sp.is_source_wav("drums.Wav"))
        self.assertFalse(sp.is_source_wav("notes.txt"))
        self.assertFalse(sp.is_source_wav("Vocals.mp3"))
        self.assertFalse(sp.is_source_wav(".hidden.wav"))

    def test_skips_own_outputs(self):
        self.assertFalse(sp.is_source_wav("Vocals_prep.wav"))
        self.assertFalse(sp.is_source_wav("Vocals_PREP.WAV"))
        self.assertFalse(sp.is_source_wav("Drums_Kick_Trigger.wav"))

    def test_find_source_wavs(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            for n in ["Vocals.WAV", "bass.wav", "Drums_prep.wav", "x.txt"]:
                _touch_wav(d / n)
            (d / "sub.wav").mkdir()
            self.assertEqual([p.name for p in sp.find_source_wavs(d)], ["bass.wav", "Vocals.WAV"])


class TestFilters(unittest.TestCase):
    def test_off_is_none_for_all(self):
        for kind in sp.STEM_KINDS:
            self.assertIsNone(sp.build_prep_filter(kind, "off"))

    def test_gentle(self):
        v = sp.build_prep_filter("vocals", "gentle")
        self.assertIn("highpass=f=80", v)
        self.assertIn("lowpass=f=18000", v)
        b = sp.build_prep_filter("bass", "gentle")
        self.assertIn("highpass=f=30", b)
        self.assertNotIn("lowpass", b)
        self.assertIn("highpass=f=30", sp.build_prep_filter("drums", "gentle"))
        o = sp.build_prep_filter("other", "gentle")
        self.assertIn("highpass=f=40", o)
        self.assertIn("lowpass=f=18000", o)

    def test_bright_tame(self):
        v = sp.build_prep_filter("vocals", "bright-tame")
        self.assertIn("equalizer=f=4600", v)
        self.assertIn("highshelf", v)
        self.assertRegex(v, r"lowpass=f=15\d00")
        for kind in ("drums", "bass", "other"):
            f = sp.build_prep_filter(kind, "bright-tame")
            self.assertRegex(f, r"lowpass=f=1[56]\d00")
            self.assertNotIn("4600", f)

    def test_no_pitch_or_phase_processing(self):
        banned = ("asetrate", "aresample", "atempo", "allpass", "rubberband")
        for preset in sp.PRESETS:
            for kind in sp.STEM_KINDS:
                f = sp.build_prep_filter(kind, preset) or ""
                for b in banned:
                    self.assertNotIn(b, f)
        src = Path(sp.__file__).read_text(encoding="utf-8").lower()
        for word in ("scrub", "watermark"):
            self.assertNotIn(word, src)

    def test_unknown_values(self):
        with self.assertRaises(ValueError):
            sp.build_prep_filter("vocals", "loud")
        with self.assertRaises(ValueError):
            sp.build_prep_filter("kazoo", "gentle")


class TestCommands(unittest.TestCase):
    def test_ffmpeg_cmd_with_filter(self):
        cmd = sp.build_ffmpeg_cmd(Path("in.wav"), Path("out_prep.wav"), "highpass=f=80")
        self.assertEqual(cmd[0], "ffmpeg")
        self.assertIn("-af", cmd)
        self.assertEqual(cmd[cmd.index("-af") + 1], "highpass=f=80")
        self.assertEqual(cmd[cmd.index("-c:a") + 1], "pcm_s24le")
        self.assertNotIn("-ar", cmd)
        self.assertEqual(cmd[-1], "out_prep.wav")
        self.assertEqual(cmd[cmd.index("-i") + 1], "in.wav")

    def test_ffmpeg_cmd_off_has_no_filter(self):
        cmd = sp.build_ffmpeg_cmd("in.wav", "out.wav", None, ffmpeg="/opt/ffmpeg")
        self.assertEqual(cmd[0], "/opt/ffmpeg")
        self.assertNotIn("-af", cmd)
        self.assertIn("pcm_s24le", cmd)

    def test_trigger_cmds(self):
        cmds = sp.build_trigger_cmds(Path("/x/Drums.wav"), Path("/o/Drum_Triggers"))
        names = [p.name for p, _ in cmds]
        self.assertEqual(names, ["Drums_Kick_Trigger.wav", "Drums_Snare_Trigger.wav", "Drums_Hat_Trigger.wav"])
        for dest, cmd in cmds:
            af = cmd[cmd.index("-af") + 1]
            self.assertIn("agate", af)
            self.assertIn("dynaudnorm", af)
            self.assertLess(af.index("dynaudnorm"), af.index("agate"))
            self.assertEqual(cmd[-1], str(dest))
            self.assertNotIn("-ar", cmd)

    def test_trigger_names_unique_per_drum_stem(self):
        a = {p for p, _ in sp.build_trigger_cmds("Drums.wav", "t")}
        b = {p for p, _ in sp.build_trigger_cmds("Percussion.wav", "t")}
        self.assertFalse(a & b)


class TestBaseDir(unittest.TestCase):
    def test_precedence(self):
        self.assertEqual(sp.resolve_base_dir("/cli", {"MUSIC_PIPELINE_DIR": "/env"}), Path("/cli"))
        self.assertEqual(sp.resolve_base_dir(None, {"MUSIC_PIPELINE_DIR": "/env"}), Path("/env"))
        self.assertEqual(sp.resolve_base_dir(None, {}), Path("C:/Music_Pipeline"))

    def test_paths_layout(self):
        p = sp.PipelinePaths(Path("/b"))
        self.assertEqual(p.stems, Path("/b/02_Moises_Stems"))
        self.assertEqual(p.prepped, Path("/b/03_Prepped_Stems"))
        self.assertEqual(p.fl_project, Path("/b/04_FL_Project"))
        self.assertEqual(p.template_flp, Path("/b/Templates/Project_Template.flp"))
        self.assertEqual(p.done_marker("T"), Path("/b/03_Prepped_Stems/T/.done"))


class FakeClock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t

    def sleep(self, s):
        self.t += max(s, 0.01)


class TestReadiness(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_stable_folder_ready(self):
        _touch_wav(self.dir / "Vocals.wav")
        clock = FakeClock()
        self.assertTrue(sp.wait_until_stable(self.dir, 2.0, 10.0, 0.5, clock, clock.sleep))
        self.assertGreaterEqual(clock.t, 2.0)

    def test_zero_settle_is_immediate(self):
        _touch_wav(self.dir / "Vocals.wav")
        self.assertTrue(sp.wait_until_stable(self.dir, 0, 0))

    def test_changing_folder_times_out(self):
        _touch_wav(self.dir / "Vocals.wav")
        clock = FakeClock()
        n = [0]

        def sleep(s):
            clock.sleep(s)
            n[0] += 1
            (self.dir / "Vocals.wav").write_bytes(b"x" * n[0])  # keeps growing

        self.assertFalse(sp.wait_until_stable(self.dir, 2.0, 5.0, 0.5, clock, sleep))

    def test_change_resets_settle_timer(self):
        _touch_wav(self.dir / "Vocals.wav")
        clock = FakeClock()
        calls = [0]

        def sleep(s):
            clock.sleep(s)
            calls[0] += 1
            if calls[0] == 2:
                _touch_wav(self.dir / "Bass.wav")

        self.assertTrue(sp.wait_until_stable(self.dir, 2.0, 30.0, 0.5, clock, sleep))
        self.assertGreaterEqual(clock.t, 3.0)

    def test_empty_folder_not_ready(self):
        clock = FakeClock()
        self.assertFalse(sp.wait_until_stable(self.dir, 0, 3.0, 0.5, clock, clock.sleep))

    def test_missing_folder(self):
        self.assertFalse(sp.wait_until_stable(self.dir / "nope", 0, 1))

    def test_pending_tracks_skip_done(self):
        paths = sp.PipelinePaths(self.dir)
        for t in ("A", "B", ".hidden"):
            (paths.stems / t).mkdir(parents=True)
        paths.done_marker("A").parent.mkdir(parents=True)
        paths.done_marker("A").write_text("")
        self.assertEqual([p.name for p in sp.pending_tracks(paths)], ["B"])

    def test_track_dir_for_event(self):
        root = self.dir / "02_Moises_Stems"
        (root / "Song").mkdir(parents=True)
        self.assertEqual(sp.track_dir_for_event(root, root / "Song" / "Vocals.wav"), root / "Song")
        self.assertEqual(sp.track_dir_for_event(root, root / "Song"), root / "Song")
        self.assertIsNone(sp.track_dir_for_event(root, self.dir / "elsewhere.wav"))
        self.assertIsNone(sp.track_dir_for_event(root, root))


class ProcessingBase(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.base = Path(self._tmp.name)
        self.paths = sp.PipelinePaths(self.base)
        self.track = self.paths.stems / "My Song"
        for n in ("Vocals.WAV", "Drums.wav", "Bass.wav", "Other.wav"):
            _touch_wav(self.track / n)

    def tearDown(self):
        self._tmp.cleanup()

    def prepper(self, runner, **kw):
        kw.setdefault("settle_secs", 0)
        kw.setdefault("settle_timeout", 1)
        return sp.StemPrepper(self.paths, runner=runner, out=lambda s: None, **kw)


class TestProcessing(ProcessingBase):
    def test_success_writes_outputs_and_done(self):
        runner = FakeRunner()
        res = self.prepper(runner).process_track(self.track)
        self.assertTrue(res.success)
        self.assertEqual(len(runner.calls), 4 + 3)
        out = self.paths.track_out("My Song")
        self.assertTrue((out / "Audio_Stems" / "Vocals_prep.wav").exists())
        self.assertTrue((out / "Drum_Triggers" / "Drums_Kick_Trigger.wav").exists())
        self.assertTrue((out / ".done").exists())
        _, kwargs = runner.calls[0]
        self.assertEqual(kwargs["stderr"], subprocess.PIPE)

    def test_error_isolation(self):
        runner = FakeRunner(fail_substr="Bass_prep")
        with self.assertLogs("stem_prep", level="ERROR") as cm:
            res = self.prepper(runner).process_track(self.track)
        self.assertFalse(res.success)
        self.assertEqual(len(res.failed), 1)
        self.assertEqual(len(runner.calls), 7)  # kept going after the failure
        stems = self.paths.track_out("My Song") / "Audio_Stems"
        self.assertTrue((stems / "Vocals_prep.wav").exists())
        self.assertTrue((stems / "Other_prep.wav").exists())
        self.assertFalse((stems / "Bass_prep.wav").exists())  # partial removed
        self.assertFalse(self.paths.done_marker("My Song").exists())
        self.assertTrue(any("boom" in line for line in cm.output))

    def test_runner_oserror_is_failure(self):
        runner = FakeRunner(raise_exc=FileNotFoundError("ffmpeg"))
        with self.assertLogs("stem_prep", level="ERROR"):
            res = self.prepper(runner).process_track(self.track)
        self.assertEqual(len(res.failed), 7)
        self.assertFalse(self.paths.done_marker("My Song").exists())

    def test_preset_off_has_no_filters(self):
        runner = FakeRunner()
        self.prepper(runner, preset="off").process_track(self.track)
        prep_cmds = [c for c, _ in runner.calls if c[-1].endswith("_prep.wav")]
        self.assertEqual(len(prep_cmds), 4)
        for c in prep_cmds:
            self.assertNotIn("-af", c)

    def test_multiple_drum_stems_do_not_collide(self):
        _touch_wav(self.track / "Percussion.wav")
        runner = FakeRunner()
        self.prepper(runner).process_track(self.track)
        trig = sorted(p.name for p in (self.paths.track_out("My Song") / "Drum_Triggers").iterdir())
        self.assertEqual(len(trig), 6)

    def test_template_copied_not_overwritten(self):
        self.paths.template_flp.parent.mkdir(parents=True)
        self.paths.template_flp.write_bytes(b"TEMPLATE")
        self.prepper(FakeRunner()).process_track(self.track)
        flp = self.paths.fl_project / "My Song" / "My Song.flp"
        self.assertEqual(flp.read_bytes(), b"TEMPLATE")
        flp.write_bytes(b"USER EDITS")
        self.paths.done_marker("My Song").unlink()
        self.prepper(FakeRunner()).process_track(self.track)
        self.assertEqual(flp.read_bytes(), b"USER EDITS")

    def test_handle_track_skips_done(self):
        runner = FakeRunner()
        p = self.prepper(runner)
        self.assertIsNotNone(p.handle_track(self.track))
        n = len(runner.calls)
        self.assertIsNone(p.handle_track(self.track))
        self.assertEqual(len(runner.calls), n)

    def test_failed_track_retried_only_after_change(self):
        runner = FakeRunner(fail_substr="Bass_prep")
        p = self.prepper(runner)
        with self.assertLogs("stem_prep", level="ERROR"):
            p.handle_track(self.track)
        n = len(runner.calls)
        self.assertIsNone(p.handle_track(self.track))
        self.assertEqual(len(runner.calls), n)
        _touch_wav(self.track / "Bass.wav", b"RIFF-new-data")
        runner.fail_substr = None
        res = p.handle_track(self.track)
        self.assertTrue(res.success)
        self.assertTrue(self.paths.done_marker("My Song").exists())

    def test_dry_run_prints_and_writes_nothing(self):
        runner = mock.Mock()
        lines = []
        p = sp.StemPrepper(self.paths, runner=runner, dry_run=True, settle_secs=0, out=lines.append)
        res = p.process_track(self.track)
        runner.assert_not_called()
        self.assertTrue(res.success)
        self.assertEqual(len(lines), 7)
        self.assertTrue(all("ffmpeg" in l and "pcm_s24le" in l for l in lines))
        self.assertFalse(self.paths.prepped.exists())

    def test_run_once_counts_failures(self):
        with self.assertLogs("stem_prep", level="ERROR"):
            rc = self.prepper(FakeRunner(fail_substr="Vocals")).run_once()
        self.assertEqual(rc, 1)
        self.assertEqual(self.prepper(FakeRunner()).run_once(), 0)


class TestTrackQueue(unittest.TestCase):
    def test_dedupe_and_processing(self):
        seen = []
        gate = threading.Event()

        def handler(p):
            gate.wait(5)
            seen.append(p)

        q = sp.TrackQueue(handler)
        self.assertTrue(q.submit(Path("a")))
        self.assertFalse(q.submit(Path("a")))
        self.assertTrue(q.submit(Path("b")))
        q.start()
        gate.set()
        q.stop(timeout=5)
        self.assertEqual(seen, [Path("a"), Path("b")])

    def test_worker_survives_exceptions(self):
        seen = []

        def handler(p):
            if p.name == "bad":
                raise RuntimeError("x")
            seen.append(p)

        q = sp.TrackQueue(handler)
        q.start()
        with self.assertLogs("stem_prep", level="ERROR"):
            q.submit(Path("bad"))
            q.submit(Path("good"))
            q.stop(timeout=5)
        self.assertEqual(seen, [Path("good")])


class TestMain(unittest.TestCase):
    def test_no_side_effects_at_import(self):
        import sys
        with tempfile.TemporaryDirectory() as d:
            target = Path(d) / "pipeline_root"
            env = dict(os.environ, MUSIC_PIPELINE_DIR=str(target),
                       PYTHONPATH=str(Path(sp.__file__).parent))
            subprocess.run([sys.executable, "-c", "import stem_prep"], cwd=d, env=env, check=True)
            self.assertFalse(target.exists())
            self.assertEqual(list(Path(d).iterdir()), [])

    def test_missing_ffmpeg_errors(self):
        with tempfile.TemporaryDirectory() as d:
            with mock.patch("stem_prep.shutil.which", return_value=None):
                with self.assertLogs("stem_prep", level="ERROR") as cm:
                    rc = sp.main(["--base-dir", d, "--once"])
            self.assertEqual(rc, 2)
            self.assertTrue(any("ffmpeg not found" in l for l in cm.output))
            self.assertEqual(list(Path(d).iterdir()), [])

    def test_dry_run_main(self):
        with tempfile.TemporaryDirectory() as d:
            track = Path(d) / "02_Moises_Stems" / "Song"
            _touch_wav(track / "drums.WAV")
            runner = mock.Mock()
            buf = io.StringIO()
            with mock.patch("stem_prep.shutil.which", return_value="ffmpeg"), redirect_stdout(buf):
                with self.assertLogs("stem_prep", level="INFO"):
                    rc = sp.main(["--base-dir", d, "--dry-run", "--settle-secs", "0",
                                  "--preset", "bright-tame"], runner=runner)
            self.assertEqual(rc, 0)
            runner.assert_not_called()
            out = buf.getvalue()
            self.assertIn("drums_prep.wav", out)
            self.assertIn("drums_Hat_Trigger.wav", out)
            self.assertFalse((Path(d) / "03_Prepped_Stems").exists())

    def test_env_base_dir_and_dirs_created(self):
        with tempfile.TemporaryDirectory() as d:
            with mock.patch.dict(os.environ, {"MUSIC_PIPELINE_DIR": d}), \
                    mock.patch("stem_prep.shutil.which", return_value="ffmpeg"):
                with self.assertLogs("stem_prep", level="INFO"):
                    rc = sp.main(["--once"], runner=FakeRunner())
            self.assertEqual(rc, 0)
            for sub in ("01_Suno_Inbox", "02_Moises_Stems", "03_Prepped_Stems",
                        "04_FL_Project", "05_Mix_Renders", "Templates"):
                self.assertTrue((Path(d) / sub).is_dir(), sub)


def _ffprobe_rate(path: Path) -> int:
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-select_streams", "a:0", "-show_entries",
         "stream=sample_rate,codec_name", "-of", "default=nw=1", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout
    info = dict(line.split("=", 1) for line in out.strip().splitlines())
    assert info["codec_name"] == "pcm_s24le", info
    return int(info["sample_rate"])


@unittest.skipUnless(FFMPEG and FFPROBE, "ffmpeg/ffprobe not installed")
class TestIntegration(unittest.TestCase):
    def test_end_to_end_once(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            track = base / "02_Moises_Stems" / "Test Track"
            track.mkdir(parents=True)
            for name, freq in (("Vocals.WAV", 440), ("Drums.wav", 60), ("Bass.wav", 55), ("Other.wav", 880)):
                subprocess.run(
                    [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
                     "-i", f"sine=frequency={freq}:sample_rate=44100:duration=1",
                     "-c:a", "pcm_s16le", str(track / name)],
                    check=True,
                )
            (base / "Templates").mkdir()
            (base / "Templates" / "Project_Template.flp").write_bytes(b"FLP")

            for preset in ("gentle",):
                with self.assertLogs("stem_prep", level="INFO"):
                    rc = sp.main(["--base-dir", d, "--once", "--settle-secs", "0", "--preset", preset])
                self.assertEqual(rc, 0)

            out = base / "03_Prepped_Stems" / "Test Track"
            expected = [out / "Audio_Stems" / f"{s}_prep.wav" for s in ("Vocals", "Drums", "Bass", "Other")]
            expected += [out / "Drum_Triggers" / f"Drums_{b}_Trigger.wav" for b in ("Kick", "Snare", "Hat")]
            for p in expected:
                self.assertTrue(p.is_file(), p)
                self.assertEqual(_ffprobe_rate(p), 44100, p)
            self.assertTrue((out / ".done").is_file())
            self.assertEqual((base / "04_FL_Project" / "Test Track" / "Test Track.flp").read_bytes(), b"FLP")

            # Second run: already done, nothing reprocessed.
            mtime = expected[0].stat().st_mtime_ns
            with self.assertLogs("stem_prep", level="INFO"):
                self.assertEqual(sp.main(["--base-dir", d, "--once", "--settle-secs", "0"]), 0)
            self.assertEqual(expected[0].stat().st_mtime_ns, mtime)

    def test_all_presets_run_in_ffmpeg(self):
        with tempfile.TemporaryDirectory() as d:
            src = Path(d) / "src.wav"
            subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                            "sine=frequency=1000:sample_rate=44100:duration=0.5", str(src)], check=True)
            for preset in sp.PRESETS:
                for kind in sp.STEM_KINDS:
                    dest = Path(d) / f"{preset}_{kind}.wav"
                    cmd = sp.build_ffmpeg_cmd(src, dest, sp.build_prep_filter(kind, preset), FFMPEG)
                    proc = subprocess.run(cmd, capture_output=True, text=True)
                    self.assertEqual(proc.returncode, 0, (preset, kind, proc.stderr))
                    self.assertEqual(_ffprobe_rate(dest), 44100)


if __name__ == "__main__":
    unittest.main()
