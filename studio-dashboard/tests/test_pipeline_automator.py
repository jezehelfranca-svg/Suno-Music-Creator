#!/usr/bin/env python3
"""Unit tests for the Suno-Music-Creator Pipeline Automation Engine."""

from __future__ import annotations

import math
import os
from pathlib import Path
import re
import struct
import sys
import tempfile
import unittest

import numpy as np
import soundfile as sf

STUDIO_DIR = Path(__file__).resolve().parent.parent
if str(STUDIO_DIR) not in sys.path:
    sys.path.insert(0, str(STUDIO_DIR))

import humanized_mix as hm
import pipeline_automator as pa
from tests.fixtures import make_prepped_track


class TestSMFMidiWriter(unittest.TestCase):
    """Test pure-Python Standard MIDI File binary serializer."""

    def test_encode_vlq(self) -> None:
        self.assertEqual(pa.encode_vlq(0), b"\x00")
        self.assertEqual(pa.encode_vlq(127), b"\x7f")
        self.assertEqual(pa.encode_vlq(128), b"\x81\x00")
        self.assertEqual(pa.encode_vlq(16383), b"\xff\x7f")
        self.assertEqual(pa.encode_vlq(16384), b"\x81\x80\x00")

    def test_write_smf_midi(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            mid_path = Path(tmp_dir) / "test.mid"
            track = pa.MidiTrack("Test Track")
            track.add_tempo(0, 120.0)
            track.add_time_signature(0, 4, 4)
            track.add_note(tick=0, length=48, pitch=60, velocity=100)
            track.add_note(tick=48, length=48, pitch=64, velocity=90)

            pa.write_smf_midi(mid_path, [track], ppq=96)
            self.assertTrue(mid_path.is_file())
            content = mid_path.read_bytes()

            # Verify MThd header
            self.assertTrue(content.startswith(b"MThd"))
            length, fmt, ntracks, ppq = struct.unpack(">IHHH", content[4:14])
            self.assertEqual(length, 6)
            self.assertEqual(fmt, 0)
            self.assertEqual(ntracks, 1)
            self.assertEqual(ppq, 96)

            # Verify MTrk chunk
            self.assertIn(b"MTrk", content)
            self.assertTrue(content.endswith(b"\xFF\x2F\x00"))


class TestDspAlgorithms(unittest.TestCase):
    """Test BPM detection and musical key estimation."""

    def test_bpm_estimation_synthetic(self) -> None:
        sr = 24000
        duration = 10.0
        # 120 BPM = 2 beats per second (every 0.5s)
        total_samples = int(sr * duration)
        audio = np.zeros(total_samples, dtype=np.float32)

        # Place clicks every 0.5 seconds
        click_interval = int(sr * 0.5)
        for idx in range(0, total_samples - 500, click_interval):
            audio[idx : idx + 300] = 0.9 * np.sin(2 * np.pi * 1000 * np.arange(300) / sr)

        with tempfile.TemporaryDirectory() as tmp_dir:
            wav_path = Path(tmp_dir) / "synthetic_120bpm.wav"
            sf.write(str(wav_path), audio, sr)

            est_bpm = pa.estimate_bpm_from_audio(wav_path, max_duration=10.0)
            # Accept 120 BPM or its sub-harmonic/harmonic (60/120/240 clamped to 70-180)
            self.assertTrue(
                abs(est_bpm - 120.0) <= 3.0 or abs(est_bpm - 60.0) <= 2.0 or abs(est_bpm - 90.0) <= 2.0,
                f"Expected ~120 BPM, got {est_bpm}",
            )

    def test_key_estimation_c_major(self) -> None:
        sr = 22050
        duration = 5.0
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)

        # C Major chord frequencies: C4 (261.63 Hz), E4 (329.63 Hz), G4 (392.00 Hz)
        audio = (
            0.5 * np.sin(2 * np.pi * 261.63 * t)
            + 0.4 * np.sin(2 * np.pi * 329.63 * t)
            + 0.4 * np.sin(2 * np.pi * 392.00 * t)
        ).astype(np.float32)

        with tempfile.TemporaryDirectory() as tmp_dir:
            wav_path = Path(tmp_dir) / "synthetic_c_major.wav"
            sf.write(str(wav_path), audio, sr)

            key_name, scale_notes = pa.estimate_key_from_audio(wav_path)
            self.assertIn("C", key_name)
            self.assertIn("C", scale_notes)


class TestMidiGenerators(unittest.TestCase):
    """Test FPC drum mapping and Bass pitch transcription."""

    def test_fpc_drums_generation(self) -> None:
        sr = 44100
        duration = 4.0
        t_samples = int(sr * duration)

        # Kick on beats 0 and 2 (times 0.0s, 1.0s, 2.0s, 3.0s at 120 BPM)
        kick_audio = np.zeros(t_samples, dtype=np.float32)
        for t_s in [0.0, 1.0, 2.0, 3.0]:
            idx = int(t_s * sr)
            burst = np.sin(2 * np.pi * 60 * np.arange(1000) / sr) * np.linspace(1, 0, 1000)
            kick_audio[idx : idx + len(burst)] = burst

        # Snare on beats 1 and 3 (times 0.5s, 1.5s, 2.5s, 3.5s)
        snare_audio = np.zeros(t_samples, dtype=np.float32)
        for t_s in [0.5, 1.5, 2.5, 3.5]:
            idx = int(t_s * sr)
            burst = np.random.uniform(-0.8, 0.8, 1000) * np.linspace(1, 0, 1000)
            snare_audio[idx : idx + len(burst)] = burst

        # Hat on 8th notes
        hat_audio = np.zeros(t_samples, dtype=np.float32)
        for t_s in [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75]:
            idx = int(t_s * sr)
            burst = np.random.uniform(-0.5, 0.5, 300) * np.linspace(1, 0, 300)
            hat_audio[idx : idx + len(burst)] = burst

        with tempfile.TemporaryDirectory() as tmp_dir:
            triggers_dir = Path(tmp_dir) / "Drum_Triggers"
            triggers_dir.mkdir()
            sf.write(str(triggers_dir / "Song_Kick_Trigger.wav"), kick_audio, sr)
            sf.write(str(triggers_dir / "Song_Snare_Trigger.wav"), snare_audio, sr)
            sf.write(str(triggers_dir / "Song_Hat_Trigger.wav"), hat_audio, sr)

            out_mid = Path(tmp_dir) / "Song_FPC_Drums.mid"
            res = pa.generate_fpc_drums_midi("Song", triggers_dir, bpm=120.0, output_mid=out_mid)
            self.assertTrue(res)
            self.assertTrue(out_mid.is_file())
            content = out_mid.read_bytes()
            # FPC Kick (36 = 0x24), Snare Main (40 = 0x28), Hat Closed (42 = 0x2A)
            self.assertIn(bytes([0x24]), content)

    def test_bass_midi_generation(self) -> None:
        sr = 44100
        duration = 2.0
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        # 55 Hz = A1 (MIDI note 33)
        audio = (0.7 * np.sin(2 * np.pi * 55.0 * t)).astype(np.float32)

        with tempfile.TemporaryDirectory() as tmp_dir:
            bass_wav = Path(tmp_dir) / "Song_bass_prep.wav"
            sf.write(str(bass_wav), audio, sr)

            out_mid = Path(tmp_dir) / "Song_Bass.mid"
            res = pa.generate_bass_midi("Song", bass_wav, bpm=120.0, output_mid=out_mid)
            self.assertTrue(res)
            self.assertTrue(out_mid.is_file())
            content = out_mid.read_bytes()
            self.assertTrue(content.startswith(b"MThd"))


class TestMixQAReport(unittest.TestCase):
    """Test Automated Mix QA Analyzer reporting."""

    def test_mix_qa_report_generation(self) -> None:
        sr = 44100
        duration = 6.0
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)

        # Stereo mix with sub, mid, and high frequencies
        left = (0.4 * np.sin(2 * np.pi * 80.0 * t) + 0.2 * np.sin(2 * np.pi * 1000.0 * t) + 0.1 * np.sin(2 * np.pi * 10000.0 * t)).astype(np.float32)
        right = (0.4 * np.sin(2 * np.pi * 80.0 * t) + 0.2 * np.sin(2 * np.pi * 1000.0 * t) + 0.1 * np.sin(2 * np.pi * 12000.0 * t)).astype(np.float32)
        stereo = np.column_stack([left, right])

        with tempfile.TemporaryDirectory() as tmp_dir:
            wav_path = Path(tmp_dir) / "Test_Mix.wav"
            sf.write(str(wav_path), stereo, sr)

            qa = pa.MixQAReport(wav_path)
            report = qa.generate_report()

            # Verify required sections
            self.assertIn("# Mix QA Analysis Report: Test_Mix", report)
            self.assertIn("1. Loudness & Dynamic Range Overview", report)
            self.assertIn("2. Five-Band Frequency & Stereo Assessment", report)
            self.assertIn("Band 1: Harshness / Fizz (8–16 kHz)", report)
            self.assertIn("Band 2: Sibilance (5.5–10 kHz)", report)
            self.assertIn("Band 3: Low-Mid Mud (150–400 Hz)", report)
            self.assertIn("Band 4: Sub (20–120 Hz)", report)
            self.assertIn("Band 5: Stereo Image & Mono Compatibility", report)
            self.assertIn("3. Recommended Actionable Fix List", report)
            self.assertIn(" – ", report)
            # No canned advice: nothing about pocket/lay-back that wasn't measured
            self.assertNotIn("lay-back", report)
            self.assertIn("Fruity", report)


class TestLoudnessMeter(unittest.TestCase):
    """The built-in BS.1770 meter must match the standard's reference values."""

    def test_reference_sine(self) -> None:
        sr = 48000
        t = np.arange(sr * 10) / sr
        x = np.sin(2 * np.pi * 997 * t)
        one_channel = pa.measure_loudness(np.column_stack([x, np.zeros_like(x)]), sr)
        self.assertAlmostEqual(one_channel["lufs"], -3.01, delta=0.05)  # ITU-R BS.1770 reference
        self.assertAlmostEqual(one_channel["true_peak"], 0.0, delta=0.1)
        quiet = pa.measure_loudness(np.column_stack([x, x]) * 0.1, sr)
        self.assertAlmostEqual(quiet["lufs"], -20.0, delta=0.1)

    def test_qa_without_ffmpeg_reports_measured_values_not_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            wav = Path(tmp_dir) / "Quiet_Mix.wav"
            sr = 44100
            t = np.arange(sr * 6) / sr
            x = 0.02 * np.sin(2 * np.pi * 440 * t)
            sf.write(str(wav), np.column_stack([x, x]), sr)
            report = pa.MixQAReport(wav, ffmpeg_bin="definitely-not-ffmpeg").generate_report()
            self.assertIn("built-in BS.1770 meter", report)
            self.assertNotIn("-14.0 LUFS**", report)  # the old invented fallback value
            m = re.search(r"Integrated Loudness\*\* \| \*\*([-\d\.]+) LUFS", report)
            self.assertIsNotNone(m)
            self.assertLess(float(m.group(1)), -25.0)


class TestTempoAndGrid(unittest.TestCase):

    def test_refine_tempo_fixes_estimator_error_and_finds_pickup(self) -> None:
        true_bpm, pickup = 120.0, 0.25
        onsets = [pickup + i * 0.5 for i in range(64)]
        bpm, downbeat = pa.refine_tempo(onsets, 119.4)  # autocorrelation was 0.6 BPM off
        self.assertAlmostEqual(bpm, true_bpm, delta=0.02)
        self.assertAlmostEqual(downbeat, pickup, delta=0.005)

    def test_drum_transcription_is_deterministic_and_grid_aware(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            paths = pa.PipelinePaths(Path(tmp_dir))
            paths.ensure_dirs()
            td = make_prepped_track(paths, "Demo", seconds=8.0, pickup=0.25)
            a, downbeat, bpm = pa.transcribe_drum_hits("Demo", td / "Drum_Triggers", 119.0)
            b, _, _ = pa.transcribe_drum_hits("Demo", td / "Drum_Triggers", 119.0)
            self.assertEqual(a, b)  # no random jitter in transcription
            self.assertAlmostEqual(bpm, 120.0, delta=0.1)
            self.assertAlmostEqual(downbeat % 0.5, 0.25, delta=0.01)
            # Backbeat snares (beats 2 and 4) map to the main snare pad despite the pickup
            snares = [n for n in a if n["role"] == "snare"]
            self.assertTrue(snares)
            self.assertTrue(all(n["pitch"] == pa.FPC_SNARE_MAIN for n in snares if n["vel"] > 0.6))


class TestHumanizedMix(unittest.TestCase):

    def test_smf_roundtrip(self) -> None:
        notes = [{"start": 0.5, "dur": 0.25, "pitch": 36, "vel": 0.8}, {"start": 1.0, "dur": 0.5, "pitch": 40, "vel": 0.5}]
        with tempfile.TemporaryDirectory() as tmp_dir:
            mid = Path(tmp_dir) / "x.mid"
            pa.write_smf_midi(mid, [pa.notes_to_midi_track("t", notes, 100.0, channel=9)])
            back, bpm = hm.read_smf(mid)
        self.assertAlmostEqual(bpm, 100.0, places=1)
        self.assertEqual([n["pitch"] for n in back], [36, 40])
        for orig, got in zip(notes, back):
            self.assertAlmostEqual(orig["start"], got["start"], delta=0.01)
            self.assertAlmostEqual(orig["dur"], got["dur"], delta=0.01)
            self.assertAlmostEqual(orig["vel"], got["vel"], delta=0.01)

    def test_humanize_zero_is_quantized_and_seed_is_repeatable(self) -> None:
        notes = [{"start": 0.5 * i, "dur": 0.1, "pitch": 36 if i % 2 == 0 else 38, "vel": 0.7} for i in range(16)]
        parts = {"drums": notes}
        zero = hm.humanize_notes(parts, 120.0, 0.0, hm.HumanizeSettings(humanize=0.0), seed=1)["drums"]
        self.assertEqual([n["start"] for n in zero], [n["start"] for n in notes])
        s = hm.HumanizeSettings(humanize=0.8)
        a = hm.humanize_notes(parts, 120.0, 0.0, s, seed=5)["drums"]
        b = hm.humanize_notes(parts, 120.0, 0.0, s, seed=5)["drums"]
        c = hm.humanize_notes(parts, 120.0, 0.0, s, seed=6)["drums"]
        self.assertEqual(a, b)
        self.assertNotEqual([n["start"] for n in a], [n["start"] for n in c])
        offsets = np.array([h["start"] - n["start"] for h, n in zip(a, notes)])
        self.assertLess(np.max(np.abs(offsets)), 0.040)  # human, not sloppy: under 40 ms
        self.assertGreater(np.std(offsets), 0.001)
        # Backbeat snares sit behind the beat on average (lay-back)
        snare_off = [h["start"] - n["start"] for h, n in zip(a, notes) if n["pitch"] == 38]
        kick_off = [h["start"] - n["start"] for h, n in zip(a, notes) if n["pitch"] == 36]
        self.assertGreater(np.mean(snare_off), np.mean(kick_off))

    def test_render_humanized_mix_end_to_end(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            paths = pa.PipelinePaths(Path(tmp_dir))
            paths.ensure_dirs()
            td = make_prepped_track(paths, "Demo", seconds=8.0)
            self.assertEqual(pa.generate_midi_and_metadata(paths), 1)
            self.assertEqual(hm.pending_humanized(paths), ["Demo"])

            result = hm.run_humanized(paths, "Demo", hm.HumanizeSettings(target_lufs=-14.0), ffmpeg_bin="definitely-not-ffmpeg")
            self.assertIsNotNone(result, pa.failures(paths).all())
            self.assertEqual(result["drum_samples"], {"kick": 4, "snare": 4, "hat": 4})  # sampled from the stem
            self.assertAlmostEqual(result["loudness"]["lufs"], -14.0, delta=0.3)
            self.assertLessEqual(result["loudness"]["true_peak"], -1.0)
            for f in ("05_Mix_Renders/Demo_Humanized.wav", "05_Mix_Renders/Demo_Humanized_Mix_QA_Report.md",
                      "03_Prepped_Stems/Demo/MIDI/Demo_FPC_Drums_Humanized.mid",
                      "03_Prepped_Stems/Demo/Humanized_Stems/Demo_Drums_Performed.wav",
                      "03_Prepped_Stems/Demo/humanize_settings.json"):
                self.assertTrue((paths.base / f).is_file(), f)
            self.assertEqual(hm.pending_humanized(paths), [])

            rough = hm.render_rough_mix(paths, "Demo", ffmpeg_bin="definitely-not-ffmpeg")
            self.assertTrue(rough.is_file())

    def test_failed_render_is_recorded_once(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            paths = pa.PipelinePaths(Path(tmp_dir))
            paths.ensure_dirs()
            td = paths.prepped / "Empty"
            (td / "MIDI").mkdir(parents=True)
            (td / "Audio_Stems").mkdir()
            (td / "MIDI" / ".midi_done").write_text("x")
            (td / "Audio_Stems" / "Empty_vocals_prep.wav").write_bytes(b"not a wav")
            self.assertEqual(hm.pending_humanized(paths), ["Empty"])
            self.assertIsNone(hm.run_humanized(paths, "Empty"))
            self.assertEqual(hm.pending_humanized(paths), [])  # blocked until inputs change
            self.assertEqual(pa.failures(paths).for_track("Empty")[0]["stage"], "humanized_mix")

    def test_simultaneous_drum_hits_do_not_flam(self) -> None:
        defaults = hm.HumanizeSettings()
        self.assertEqual(defaults.keep_cymbals, 0.0)
        self.assertEqual(defaults.bass_mode, "replace")

        notes = [
            {"start": 0.0, "dur": 0.1, "pitch": 36, "vel": 0.9},   # kick at beat 1
            {"start": 0.0, "dur": 0.1, "pitch": 42, "vel": 0.6},   # hat at beat 1
            {"start": 0.25, "dur": 0.1, "pitch": 42, "vel": 0.5},  # off-beat hat
            {"start": 0.5, "dur": 0.1, "pitch": 38, "vel": 0.85},  # snare at beat 2
            {"start": 0.5, "dur": 0.1, "pitch": 42, "vel": 0.6},   # hat at beat 2
        ]
        human = hm.humanize_notes({"drums": notes}, 120.0, 0.0, hm.HumanizeSettings(humanize=0.8), seed=42)["drums"]
        kick_t = next(n["start"] for n in human if n["pitch"] == 36)
        hat_at_kick_t = next(n["start"] for n in human if n["pitch"] == 42 and n["start"] < 0.15)
        snare_t = next(n["start"] for n in human if n["pitch"] == 38)
        hat_at_snare_t = next(n["start"] for n in human if n["pitch"] == 42 and n["start"] > 0.35)
        self.assertLess(abs(hat_at_kick_t - kick_t), 1e-6)
        self.assertLess(abs(hat_at_snare_t - snare_t), 1e-6)


class TestFileOperations(unittest.TestCase):
    """Test wait_file_ready and atomic write helpers."""

    def test_wait_file_ready(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            p = Path(tmp_dir) / "test.txt"
            p.write_text("ready")
            # Should settle quickly with short settle_secs
            self.assertTrue(pa.wait_file_ready(p, settle_secs=0.2, timeout_secs=2.0))

    def test_atomic_writes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            p_txt = Path(tmp_dir) / "hello.txt"
            pa.atomic_write_text(p_txt, "world")
            self.assertEqual(p_txt.read_text(encoding="utf-8"), "world")

            p_bin = Path(tmp_dir) / "data.bin"
            pa.atomic_write_bytes(p_bin, b"\x01\x02\x03")
            self.assertEqual(p_bin.read_bytes(), b"\x01\x02\x03")

    def test_inbox_grouped_stem_routing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            base = Path(tmp_dir)
            paths = pa.PipelinePaths(base)
            paths.ensure_dirs()

            # Create grouped stems in inbox
            for role in ["vocals", "drums", "bass", "instruments"]:
                stem_file = paths.inbox / f"TestSong_{role}.wav"
                sf.write(str(stem_file), np.zeros(2400, dtype=np.float32), 24000)

            count = pa.process_inbox(paths)
            self.assertEqual(count, 4)

            routed_stems = list((paths.stems / "TestSong").glob("*.wav"))
            self.assertEqual(len(routed_stems), 4)


if __name__ == "__main__":
    unittest.main()
