"""End-to-end tests: run the real ``stem_prep.py --watch`` CLI as a subprocess
against real WAVs generated with ffmpeg.

Each watcher is stopped with SIGINT and must exit 0 without a traceback.
Watchdog cases run only when ``watchdog`` is importable; polling cases always
run (watchdog is hidden from the child process).
"""

import importlib.util
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")
HAVE_WATCHDOG = importlib.util.find_spec("watchdog") is not None
SCRIPT = Path(__file__).resolve().parents[1] / "stem_prep.py"

SETTLE = "0.6"
POLL = "0.25"

# Runs the script with watchdog made unimportable, forcing the polling path.
_NO_WATCHDOG = (
    "import runpy, sys; sys.modules['watchdog'] = None; "
    "sys.argv = sys.argv[1:]; runpy.run_path(sys.argv[0], run_name='__main__')"
)

needs_ffmpeg = unittest.skipUnless(FFMPEG and FFPROBE, "ffmpeg/ffprobe not on PATH")
needs_watchdog = unittest.skipUnless(HAVE_WATCHDOG, "watchdog not installed")
needs_posix_signals = unittest.skipIf(os.name == "nt", "SIGINT delivery to a child needs POSIX")


def _ffmpeg(*args):
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def make_tone(path, secs=2, rate=44100, channels=1):
    _ffmpeg("-f", "lavfi", "-i", f"sine=frequency=440:sample_rate={rate}:duration={secs}",
            "-ac", str(channels), "-c:a", "pcm_s16le", str(path))


def make_noise(path, secs=2, rate=48000, channels=1):
    _ffmpeg("-f", "lavfi", "-i", f"anoisesrc=r={rate}:d={secs}:a=0.3",
            "-ac", str(channels), "-c:a", "pcm_s16le", str(path))


def make_drums(path, secs=4, rate=44100, channels=2):
    """Quiet-ish synthetic kit: 55 Hz kick on beats, band-limited noise snare on
    the off-beats, high-passed noise hats on 16ths (at 120 bpm-ish spacing)."""
    kick = (f"sine=f=55:r={rate}:d={secs},"
            "volume='if(lt(mod(t,1),0.12),exp(-mod(t,1)*25),0)':eval=frame")
    snare = (f"anoisesrc=r={rate}:d={secs}:a=0.9,bandpass=f=900:w=1500:width_type=h,"
             "volume='if(between(mod(t,1),0.5,0.62),exp(-(mod(t,1)-0.5)*30)*1.5,0)':eval=frame")
    hat = (f"anoisesrc=r={rate}:d={secs}:a=0.9,highpass=f=8000,"
           "volume='if(lt(mod(t,0.25),0.03),0.8,0)':eval=frame")
    _ffmpeg("-f", "lavfi", "-i", kick, "-f", "lavfi", "-i", snare, "-f", "lavfi", "-i", hat,
            "-filter_complex", "[0][1][2]amix=inputs=3:normalize=0[a]", "-map", "[a]",
            "-ac", str(channels), "-c:a", "pcm_s16le", str(path))


def probe(path):
    out = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "stream=sample_rate,channels,codec_name",
         "-of", "json", str(path)], capture_output=True, text=True, check=True).stdout
    return json.loads(out)["streams"][0]


def max_volume_db(path):
    err = subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-i", str(path), "-af", "volumedetect",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    for line in err.splitlines():
        if "max_volume:" in line:
            return float(line.split("max_volume:")[1].split()[0])
    raise AssertionError(f"no volumedetect output for {path}:\n{err}")


def write_slowly(src, dest, chunks=4, delay=0.12):
    data = Path(src).read_bytes()
    step = len(data) // chunks + 1
    with open(dest, "wb") as f:
        for i in range(0, len(data), step):
            f.write(data[i:i + step])
            f.flush()
            time.sleep(delay)


class Watcher:
    """``stem_prep.py --watch`` running in a child process."""

    def __init__(self, base, polling, extra=()):
        self.log_path = Path(str(base) + ".log")
        self._log = open(self.log_path, "wb")
        cmd = [sys.executable]
        if polling:
            cmd += ["-c", _NO_WATCHDOG]
        cmd += [str(SCRIPT), "--base-dir", str(base), "--watch", "--settle-secs", SETTLE,
                "--poll-interval", POLL, "--settle-timeout", "30", "-v", *extra]
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        self.proc = subprocess.Popen(cmd, stdout=self._log, stderr=subprocess.STDOUT, env=env)
        self.wait_for(lambda: "watching" in self.log(), "watcher start")
        if polling:
            assert "polling" in self.log(), self.log()
        else:
            assert "(watchdog)" in self.log(), self.log()

    def log(self):
        return self.log_path.read_text(encoding="utf-8", errors="replace")

    def wait_for(self, cond, what, timeout=30.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if cond():
                return
            if self.proc.poll() is not None:
                break
            time.sleep(0.05)
        raise AssertionError(f"timed out waiting for {what}\n--- watcher log ---\n{self.log()}")

    def stop(self):
        """SIGINT; returns the log after asserting a clean exit."""
        if self.proc.poll() is None:
            self.proc.send_signal(signal.SIGINT)
        try:
            rc = self.proc.wait(30)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait()
            raise AssertionError(f"watcher did not stop on SIGINT\n{self.log()}")
        finally:
            self._log.close()
        text = self.log()
        if rc != 0 or "Traceback" in text:
            raise AssertionError(f"unclean exit (code {rc})\n{text}")
        return text

    def kill(self):
        if self.proc.poll() is None:
            self.proc.kill()
            self.proc.wait()
        self._log.close()


@needs_ffmpeg
@needs_posix_signals
class WatchE2EBase(unittest.TestCase):
    polling = False

    @classmethod
    def setUpClass(cls):
        cls._src_tmp = tempfile.TemporaryDirectory(prefix="stem_prep_src_")
        src = cls.src = Path(cls._src_tmp.name)
        make_tone(src / "Vocals.wav", secs=2, rate=48000, channels=2)
        make_tone(src / "Bass.wav", secs=2, rate=44100, channels=1)
        make_noise(src / "Other.wav", secs=2, rate=48000, channels=1)
        make_drums(src / "Drums.wav", secs=3, rate=44100, channels=2)
        # Long enough that ffmpeg takes a noticeable moment.
        make_noise(src / "Long.wav", secs=60, rate=48000, channels=2)

    @classmethod
    def tearDownClass(cls):
        cls._src_tmp.cleanup()

    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="stem_prep_e2e_")
        self.addCleanup(tmp.cleanup)
        self.base = Path(tmp.name) / "base"
        self.stems = self.base / "02_Moises_Stems"
        self.prepped = self.base / "03_Prepped_Stems"

    def start(self, **kw):
        w = Watcher(self.base, self.polling, **kw)
        self.addCleanup(w.kill)
        return w

    def done(self, track):
        return (self.prepped / track / ".done").exists()

    def assert_prepped(self, track, stems, drums=()):
        out = self.prepped / track
        self.assertTrue((out / ".done").exists(), f"{track}: no .done")
        for s in stems:
            self.assertTrue((out / "Audio_Stems" / f"{s}_prep.wav").is_file(), s)
        for d in drums:
            for band in ("Kick", "Snare", "Hat"):
                self.assertTrue((out / "Drum_Triggers" / f"{d}_{band}_Trigger.wav").is_file(), (d, band))


class _CommonScenarios:
    """Scenarios run in both watchdog and polling mode."""

    def test_slow_writes_processed_once_after_settling(self):
        w = self.start()
        track = self.stems / "Track A"
        track.mkdir()
        names = ("Vocals", "Bass", "Drums")
        for n in names:
            write_slowly(self.src / f"{n}.wav", track / f"{n}.wav")
            time.sleep(0.25)
        self.assertFalse(self.done("Track A"))
        w.wait_for(lambda: self.done("Track A"), ".done")
        time.sleep(1.0)  # trailing events must not trigger another pass
        log = w.stop()
        self.assertEqual(log.count("[Track A] preparing"), 1, log)
        self.assertNotIn("in-event", log, "-v must not turn on watchdog's per-event debug spam")
        self.assert_prepped("Track A", names, drums=["Drums"])
        for n in names:
            src = probe(self.src / f"{n}.wav")
            out = probe(self.prepped / "Track A" / "Audio_Stems" / f"{n}_prep.wav")
            self.assertEqual(out["sample_rate"], src["sample_rate"], n)
            self.assertEqual(out["channels"], src["channels"], n)
            self.assertEqual(out["codec_name"], "pcm_s24le", n)

    def test_stem_added_during_processing(self):
        w = self.start()
        track = self.stems / "Late"
        track.mkdir()
        shutil.copy(self.src / "Long.wav", track / "Atmos.wav")
        shutil.copy(self.src / "Long.wav", track / "Pad.wav")
        w.wait_for(lambda: "[Late] preparing" in w.log(), "first pass")
        shutil.copy(self.src / "Bass.wav", track / "Bass.wav")
        w.wait_for(lambda: "source folder changed" in w.log(), "change detected", timeout=20)
        self.assertFalse(self.done("Late"), "marked done despite a late stem")
        w.wait_for(lambda: self.done("Late"), ".done after second pass", timeout=30)
        log = w.stop()
        self.assertEqual(log.count("[Late] preparing"), 2, log)
        self.assert_prepped("Late", ["Atmos", "Pad", "Bass"])

    def test_corrupt_stem_then_replaced(self):
        w = self.start()
        track = self.stems / "Corrupt"
        track.mkdir()
        shutil.copy(self.src / "Vocals.wav", track / "Vocals.wav")
        (track / "Bass.wav").write_bytes(os.urandom(40000))
        w.wait_for(lambda: "not marking done" in w.log(), "failure")
        out = self.prepped / "Corrupt" / "Audio_Stems"
        self.assertTrue((out / "Vocals_prep.wav").is_file())
        self.assertFalse((out / "Bass_prep.wav").exists(), "partial output left behind")
        self.assertFalse(self.done("Corrupt"))
        time.sleep(1.0)  # unchanged failed folder is not retried in a loop
        self.assertEqual(w.log().count("[Corrupt] preparing"), 1)
        shutil.copy(self.src / "Bass.wav", track / "Bass.wav")
        w.wait_for(lambda: self.done("Corrupt"), ".done after fix")
        w.stop()
        self.assert_prepped("Corrupt", ["Vocals", "Bass"])

    def test_corrupt_stem_deleted(self):
        w = self.start()
        track = self.stems / "Deleted"
        track.mkdir()
        shutil.copy(self.src / "Vocals.wav", track / "Vocals.wav")
        (track / "Bass.wav").write_bytes(os.urandom(40000))
        w.wait_for(lambda: "not marking done" in w.log(), "failure")
        (track / "Bass.wav").unlink()
        w.wait_for(lambda: self.done("Deleted"), ".done after removing the bad stem", timeout=10)
        w.stop()

    def test_startup_scan_and_done_untouched(self):
        for name in ("Pending", "Finished"):
            (self.stems / name).mkdir(parents=True)
            shutil.copy(self.src / "Bass.wav", self.stems / name / "Bass.wav")
        marker = self.prepped / "Finished" / ".done"
        marker.parent.mkdir(parents=True)
        marker.write_text("old\n")
        w = self.start()
        w.wait_for(lambda: self.done("Pending"), "startup scan")
        time.sleep(0.8)
        log = w.stop()
        self.assertEqual(marker.read_text(), "old\n")
        self.assertFalse((self.prepped / "Finished" / "Audio_Stems").exists())
        self.assertNotIn("[Finished]", log)


@needs_watchdog
class TestWatchdogMode(_CommonScenarios, WatchE2EBase):
    polling = False

    def test_folder_moved_in(self):
        w = self.start()
        staging = self.base / "staging" / "Moved Track"
        staging.mkdir(parents=True)
        shutil.copy(self.src / "Vocals.wav", staging / "Vocals.wav")
        shutil.copy(self.src / "Drums.wav", staging / "Drums.wav")
        os.rename(staging, self.stems / "Moved Track")
        w.wait_for(lambda: self.done("Moved Track"), ".done")
        w.stop()
        self.assert_prepped("Moved Track", ["Vocals", "Drums"], drums=["Drums"])

    def test_unicode_uppercase_and_nested_folder(self):
        w = self.start()
        track = self.stems / "Canción Uno"
        (track / "extras").mkdir(parents=True)
        shutil.copy(self.src / "Bass.wav", track / "extras" / "Nested.wav")
        shutil.copy(self.src / "Vocals.wav", track / "LEAD VOCALS.WAV")
        shutil.copy(self.src / "Drums.wav", track / "Drum Kit.WAV")
        w.wait_for(lambda: self.done("Canción Uno"), ".done")
        # Writes inside a nested folder after completion do not reprocess.
        shutil.copy(self.src / "Bass.wav", track / "extras" / "More.wav")
        time.sleep(1.2)
        log = w.stop()
        self.assertEqual(log.count("preparing"), 1, log)
        self.assert_prepped("Canción Uno", ["LEAD VOCALS", "Drum Kit"], drums=["Drum Kit"])
        self.assertEqual(list((self.prepped / "Canción Uno").rglob("Nested*")), [],
                         "nested subfolders are not stem sources")

    def test_sigint_mid_track_stops_promptly_without_done(self):
        track = self.stems / "Big"
        track.mkdir(parents=True)
        for n in ("A_Other", "B_Other", "C_Other", "D_Other"):
            shutil.copy(self.src / "Long.wav", track / f"{n}.wav")
        w = self.start()
        w.wait_for(lambda: "ok   A_Other_prep.wav" in w.log(), "first output")
        t0 = time.monotonic()
        log = w.stop()
        self.assertLess(time.monotonic() - t0, 5.0, "kept processing after SIGINT")
        self.assertIn("stopped before finishing", log)
        self.assertFalse(self.done("Big"))


class TestPollingMode(_CommonScenarios, WatchE2EBase):
    polling = True


@needs_ffmpeg
class TestDrumTriggers(unittest.TestCase):
    def test_triggers_non_silent_and_distinct(self):
        with tempfile.TemporaryDirectory(prefix="stem_prep_drums_") as tmp:
            base = Path(tmp)
            track = base / "02_Moises_Stems" / "Kit"
            track.mkdir(parents=True)
            # 3 s and quiet: the whole file sits inside dynaudnorm's boundary
            # region, which used to leave the kick band un-levelled and gated.
            make_drums(track / "Drums.wav", secs=3)
            r = subprocess.run([sys.executable, str(SCRIPT), "--base-dir", str(base), "--once",
                                "--settle-secs", "0"],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            trig = base / "03_Prepped_Stems" / "Kit" / "Drum_Triggers"
            outs = {b: trig / f"Drums_{b}_Trigger.wav" for b in ("Kick", "Snare", "Hat")}
            for band, path in outs.items():
                self.assertGreater(max_volume_db(path), -12.0, f"{band} trigger is (near) silent")
                self.assertEqual(probe(path)["sample_rate"], "44100")
            self.assertEqual(len({p.read_bytes() for p in outs.values()}), 3)


if __name__ == "__main__":
    unittest.main()
