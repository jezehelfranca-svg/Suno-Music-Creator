#!/usr/bin/env python3
"""Unit tests for the Suno-Music-Creator Pipeline Automation Engine."""

from __future__ import annotations

import math
import os
from pathlib import Path
import struct
import sys
import tempfile
import unittest

import numpy as np
import soundfile as sf

STUDIO_DIR = Path(__file__).resolve().parent.parent
if str(STUDIO_DIR) not in sys.path:
    sys.path.insert(0, str(STUDIO_DIR))

import pipeline_automator as pa


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
            self.assertIn("2. Five-Band Frequency & Pocket Assessment", report)
            self.assertIn("Band 1: Harshness / Fizz (8–16 kHz)", report)
            self.assertIn("Band 2: Sibilance (5.5–10 kHz)", report)
            self.assertIn("Band 3: Low-End Balance: Sub (20–120 Hz) vs. Mud (150–400 Hz)", report)
            self.assertIn("Band 4: Loudness & True Peak / Transients", report)
            self.assertIn("Band 5: Timing & Pocket Assessment", report)
            self.assertIn("3. Recommended Actionable Fix List", report)
            # Verify fix item format MM:SS - element - issue - suggested FL Studio move
            self.assertIn(" – ", report)
            self.assertIn("Fruity", report)


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
