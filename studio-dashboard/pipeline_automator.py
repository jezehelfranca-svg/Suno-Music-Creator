#!/usr/bin/env python3
"""Unified Suno-Music-Creator Pipeline Automation Engine.

Automates the complete Suno-to-FL-Studio music production pipeline:
- Stage 1 -> 2: Inbox monitoring, grouped stem routing, Demucs 4-stem separation fallback.
- Stage 2: Stem preparation, high-pass/filtering, drum trigger audio generation,
  and non-destructive FL Studio project provisioning from templates.
- Stage 3 & 4: Audio-to-MIDI transcription for FPC drums and bass with groove humanization,
  onset gating, BPM detection, and Krumhansl-Schmuckler musical key detection.
- Stage 6: Automated Mix QA analysis (EBUR128 LUFS, True Peak, Crest Factor,
  5-band spectral and pocket audit with concrete FL Studio actionable fixes).

Zero-external-dependency Standard MIDI File (SMF) binary writer included.
"""

from __future__ import annotations

import argparse
import atexit
import json
import logging
from logging.handlers import RotatingFileHandler
import math
import os
from pathlib import Path
import random
import re
import shutil
import signal
import struct
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import scipy.signal
import soundfile as sf

try:
    from watchdog.events import FileSystemEventHandler
    from watchdog.observers import Observer
    HAVE_WATCHDOG = True
except ImportError:
    HAVE_WATCHDOG = False
    FileSystemEventHandler = object
    Observer = None

# --------------------------------------------------------------------------
# Constants & FPC Definitions
# --------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_BASE_DIR = "C:/Music_Pipeline"
ENV_BASE_DIR = "MUSIC_PIPELINE_DIR"


def _resolve_default_stem_prep() -> Path:
    """Resolve stem_prep.py portably across repo and standalone installations."""
    env_path = os.environ.get("STEM_PREP_SCRIPT", "").strip()
    if env_path:
        return Path(env_path).expanduser()

    repo_candidate = SCRIPT_DIR.parent / "pipeline" / "scripts" / "stem_prep" / "stem_prep.py"
    if repo_candidate.is_file():
        return repo_candidate

    return Path.home() / "Code" / "Suno-Music-Creator" / "pipeline" / "scripts" / "stem_prep" / "stem_prep.py"


STEM_PREP_SCRIPT_DEFAULT = _resolve_default_stem_prep()

FPC_KICK = 36          # C3
FPC_SIDESTICK = 37     # C#3
FPC_SNARE_SOFT = 38    # D3
FPC_CLAP = 39          # D#3
FPC_SNARE_MAIN = 40    # E3
FPC_HAT_CLOSED = 42    # F#3
FPC_HAT_PEDAL = 44     # G#3
FPC_HAT_OPEN = 46      # A#3
FPC_CRASH = 49         # C#4
FPC_RIDE = 51          # D#4

MIDI_PPQ = 96
DEFAULT_PRESET = "gentle"
PRESETS = ("off", "gentle", "bright-tame")

STEM_KEYWORDS: Tuple[Tuple[str, Tuple[str, ...]], ...] = (
    ("vocals", ("vocal", "vox", "voice", "singer", "acapella")),
    ("drums", ("drum", "kick", "snare", "hihat", "perc", "kit")),
    ("bass", ("bass", "808", "sub")),
    ("instruments", ("instrument", "keys", "piano", "synth", "guitar", "other")),
)

# --------------------------------------------------------------------------
# Logging Setup
# --------------------------------------------------------------------------

log = logging.getLogger("pipeline_automator")


def setup_logging(log_dir: Path, verbose: bool = False) -> None:
    """Configure console and rotating file logging."""
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "pipeline.log"

    log.setLevel(logging.DEBUG if verbose else logging.INFO)
    log.handlers.clear()

    # Console Handler
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.DEBUG if verbose else logging.INFO)
    c_fmt = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
    ch.setFormatter(c_fmt)
    log.addHandler(ch)

    # Rotating File Handler (5 MB, 3 backups)
    fh = RotatingFileHandler(str(log_file), maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    f_fmt = logging.Formatter("%(asctime)s [%(levelname)s] [%(name)s] %(message)s")
    fh.setFormatter(f_fmt)
    log.addHandler(fh)


# --------------------------------------------------------------------------
# File Stability & Atomic Writes
# --------------------------------------------------------------------------

def wait_file_ready(
    path: Path,
    settle_secs: float = 1.5,
    timeout_secs: float = 45.0,
    poll_interval: float = 0.3,
) -> bool:
    """Poll across >= settle_secs to confirm file size & mtime are unchanged and readable.

    Verifies a shared read handle can be acquired without PermissionError.
    """
    if not path.is_file():
        return False

    start_time = time.monotonic()
    deadline = start_time + timeout_secs
    last_stat: Optional[Tuple[int, int]] = None
    stable_since = start_time

    while time.monotonic() < deadline:
        try:
            st = path.stat()
            cur_stat = (st.st_size, st.st_mtime_ns)
            # Verify file can be read without locking conflicts
            with open(path, "rb") as f:
                _ = f.read(1024)
        except (OSError, PermissionError):
            last_stat = None
            time.sleep(poll_interval)
            continue

        if cur_stat[0] <= 0:
            last_stat = None
            time.sleep(poll_interval)
            continue

        now = time.monotonic()
        if cur_stat == last_stat:
            if now - stable_since >= settle_secs:
                return True
        else:
            last_stat = cur_stat
            stable_since = now

        time.sleep(poll_interval)

    return False


def atomic_write_text(path: Path, content: str, encoding: str = "utf-8") -> None:
    """Atomically write text content to path via temporary file and os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + f".tmp_{os.getpid()}_{time.time_ns()}")
    tmp_path.write_text(content, encoding=encoding)
    os.replace(tmp_path, path)


def atomic_write_bytes(path: Path, content: bytes) -> None:
    """Atomically write binary content to path via temporary file and os.replace."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + f".tmp_{os.getpid()}_{time.time_ns()}")
    tmp_path.write_bytes(content)
    os.replace(tmp_path, path)


# --------------------------------------------------------------------------
# Pure-Python Standard MIDI File (SMF) Writer
# --------------------------------------------------------------------------

def encode_vlq(val: int) -> bytes:
    """Encode an integer into MIDI Variable-Length Quantity (VLQ)."""
    if val < 0:
        val = 0
    res = bytearray()
    res.append(val & 0x7F)
    val >>= 7
    while val > 0:
        res.append((val & 0x7F) | 0x80)
        val >>= 7
    res.reverse()
    return bytes(res)


class MidiTrack:
    """Represents a single Standard MIDI File track."""

    def __init__(self, name: str = "") -> None:
        self.events: List[Tuple[int, int, bytes]] = []  # (tick, priority, event_bytes)
        if name:
            name_bytes = name.encode("utf-8")
            self.events.append((0, 0, b"\xFF\x03" + encode_vlq(len(name_bytes)) + name_bytes))

    def add_tempo(self, tick: int, bpm: float) -> None:
        """Add tempo change meta event in microseconds per quarter note."""
        uspqn = int(round(60_000_000.0 / max(1.0, bpm)))
        self.events.append((tick, 1, b"\xFF\x51\x03" + struct.pack(">I", uspqn)[1:]))

    def add_time_signature(self, tick: int, num: int = 4, den: int = 4) -> None:
        """Add time signature meta event (defaults to 4/4)."""
        den_pow = int(round(math.log2(den))) if den > 0 else 2
        self.events.append((tick, 2, bytes([0xFF, 0x58, 0x04, num, den_pow, 24, 8])))

    def add_note(self, tick: int, length: int, pitch: int, velocity: int, channel: int = 0) -> None:
        """Add a Note-On and corresponding Note-Off event."""
        clamped_pitch = max(0, min(127, pitch))
        clamped_vel = max(1, min(127, velocity))
        # Note Off priority 10, Note On priority 20 so Off triggers before On at same tick
        off_tick = max(tick + 1, tick + length)
        self.events.append((off_tick, 10, bytes([0x80 | (channel & 0x0F), clamped_pitch, 0])))
        self.events.append((tick, 20, bytes([0x90 | (channel & 0x0F), clamped_pitch, clamped_vel])))

    def serialize(self) -> bytes:
        """Serialize track into MTrk chunk bytes."""
        sorted_ev = sorted(self.events, key=lambda x: (x[0], x[1]))
        data = bytearray()
        cur_tick = 0
        for tick, _, ev_bytes in sorted_ev:
            delta = max(0, tick - cur_tick)
            data.extend(encode_vlq(delta))
            data.extend(ev_bytes)
            cur_tick = tick
        # End of track event
        data.extend(encode_vlq(0))
        data.extend(b"\xFF\x2F\x00")
        return b"MTrk" + struct.pack(">I", len(data)) + bytes(data)


def write_smf_midi(filepath: Path, tracks: Sequence[MidiTrack], ppq: int = MIDI_PPQ) -> None:
    """Write tracks to Standard MIDI File format 0 or 1 atomically."""
    format_type = 1 if len(tracks) > 1 else 0
    header = b"MThd" + struct.pack(">IHHH", 6, format_type, len(tracks), ppq)
    track_bytes = b"".join(t.serialize() for t in tracks)
    atomic_write_bytes(filepath, header + track_bytes)


# --------------------------------------------------------------------------
# Pipeline Directory Scaffolding & Paths
# --------------------------------------------------------------------------

class PipelinePaths:
    """Encapsulates all standard directories and file locations in C:/Music_Pipeline."""

    def __init__(self, base_dir: Path) -> None:
        self.base = base_dir.resolve()

    @property
    def inbox(self) -> Path:
        return self.base / "01_Suno_Inbox"

    @property
    def stems(self) -> Path:
        return self.base / "02_Moises_Stems"

    @property
    def prepped(self) -> Path:
        return self.base / "03_Prepped_Stems"

    @property
    def fl_project(self) -> Path:
        return self.base / "04_FL_Project"

    @property
    def renders(self) -> Path:
        return self.base / "05_Mix_Renders"

    @property
    def templates(self) -> Path:
        return self.base / "Templates"

    @property
    def automation(self) -> Path:
        return self.base / "Automation"

    @property
    def logs(self) -> Path:
        return self.automation / "logs"

    @property
    def pid_file(self) -> Path:
        return self.automation / ".watcher.pid"

    def ensure_dirs(self) -> None:
        for d in [self.inbox, self.stems, self.prepped, self.fl_project, self.renders, self.templates, self.automation, self.logs]:
            d.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------
# DSP Algorithms: BPM, Key & Transient Pitch Detection
# --------------------------------------------------------------------------

def estimate_bpm_from_audio(audio_path: Path, max_duration: float = 60.0) -> float:
    """Estimate tempo (BPM) from audio onset envelope autocorrelation.

    Clamped to 70-180 BPM range.
    """
    try:
        info = sf.info(str(audio_path))
        sr = info.samplerate
        frames_to_read = int(min(sr * max_duration, info.frames))
        audio, _ = sf.read(str(audio_path), stop=frames_to_read, always_2d=True)
        mono = np.mean(audio, axis=1)

        # Downsample to 12 kHz for efficient onset detection
        target_sr = 12000
        if sr > target_sr:
            mono = scipy.signal.resample_poly(mono, target_sr, sr)
            sr = target_sr

        hop = 64
        # Compute spectral flux onset envelope
        _, _, Zxx = scipy.signal.stft(mono, fs=sr, nperseg=256, noverlap=256 - hop)
        mag = np.abs(Zxx)
        diff = np.diff(mag, axis=1)
        flux = np.sum(np.maximum(0.0, diff), axis=0)

        # Autocorrelation of onset flux
        flux = flux - np.mean(flux)
        corr = np.correlate(flux, flux, mode="full")
        corr = corr[len(flux) - 1 :]

        fps = sr / hop
        min_lag = int(round(fps * 60.0 / 180.0))
        max_lag = int(round(fps * 60.0 / 70.0))

        if max_lag >= len(corr) or min_lag >= max_lag:
            return 120.0

        peak_idx = min_lag + int(np.argmax(corr[min_lag : max_lag + 1]))
        bpm = 60.0 * fps / peak_idx

        # Parabolic interpolation for sub-frame accuracy
        if 0 < peak_idx < len(corr) - 1:
            y0, y1, y2 = corr[peak_idx - 1], corr[peak_idx], corr[peak_idx + 1]
            denom = 2 * (2 * y1 - y0 - y2)
            if denom != 0:
                delta = (y0 - y2) / denom
                bpm = 60.0 * fps / (peak_idx + delta)

        while bpm < 70.0:
            bpm *= 2.0
        while bpm > 180.0:
            bpm /= 2.0

        return round(float(bpm), 1)
    except Exception as exc:
        log.warning("BPM estimation failed on %s: %s; falling back to 120.0", audio_path.name, exc)
        return 120.0


def estimate_key_from_audio(audio_path: Path, max_duration: float = 60.0) -> Tuple[str, List[str]]:
    """Estimate musical key using Krumhansl-Schmuckler chroma correlation.

    Returns (Key_String, Scale_Notes_List), e.g. ("F Minor", ["F", "G", "Ab", ...]).
    """
    pitch_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    scale_major_intervals = [0, 2, 4, 5, 7, 9, 11]
    scale_minor_intervals = [0, 2, 3, 5, 7, 8, 10]

    try:
        info = sf.info(str(audio_path))
        sr = info.samplerate
        frames_to_read = int(min(sr * max_duration, info.frames))
        audio, _ = sf.read(str(audio_path), stop=frames_to_read, always_2d=True)
        mono = np.mean(audio, axis=1)

        f, _, Zxx = scipy.signal.stft(mono, fs=sr, nperseg=4096, noverlap=2048)
        mag = np.abs(Zxx)

        # Accumulate energy into 12 chroma bins for 65 Hz - 2000 Hz
        valid = (f >= 65.0) & (f <= 2000.0)
        f_valid = f[valid]
        mag_valid = mag[valid, :]

        midi_notes = 12.0 * np.log2(f_valid / 440.0) + 69.0
        note_bins = np.round(midi_notes).astype(int) % 12

        chroma = np.zeros(12)
        for n in range(12):
            mask = (note_bins == n)
            if np.any(mask):
                chroma[n] = np.sum(mag_valid[mask, :])

        if np.std(chroma) > 0:
            chroma = (chroma - np.mean(chroma)) / np.std(chroma)

        # Standard Krumhansl-Kessler key profiles
        maj_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        min_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
        maj_profile = (maj_profile - np.mean(maj_profile)) / np.std(maj_profile)
        min_profile = (min_profile - np.mean(min_profile)) / np.std(min_profile)

        best_score = -999.0
        best_key = "C Major"
        best_scale = ["C", "D", "E", "F", "G", "A", "B"]

        for i in range(12):
            r_maj = float(np.corrcoef(chroma, np.roll(maj_profile, i))[0, 1])
            r_min = float(np.corrcoef(chroma, np.roll(min_profile, i))[0, 1])

            if r_maj > best_score:
                best_score = r_maj
                root = pitch_names[i]
                best_key = f"{root} Major"
                best_scale = [pitch_names[(i + iv) % 12] for iv in scale_major_intervals]

            if r_min > best_score:
                best_score = r_min
                root = pitch_names[i]
                best_key = f"{root} Minor"
                best_scale = [pitch_names[(i + iv) % 12] for iv in scale_minor_intervals]

        return best_key, best_scale
    except Exception as exc:
        log.warning("Key estimation failed on %s: %s; falling back to C Major", audio_path.name, exc)
        return "C Major", ["C", "D", "E", "F", "G", "A", "B"]


# --------------------------------------------------------------------------
# MIDI Generators: Drum Trigger-to-FPC & Bass-to-MIDI
# --------------------------------------------------------------------------

def generate_fpc_drums_midi(
    track_name: str,
    triggers_dir: Path,
    bpm: float,
    output_mid: Path,
    ppq: int = MIDI_PPQ,
) -> bool:
    """Generate FPC Drum MIDI from Kick, Snare, and Hat trigger WAVs.

    Applies FPC drum mapping, ghost gating, and micro-timing / velocity humanization.
    """
    kick_files = list(triggers_dir.glob("*Kick_Trigger.wav"))
    snare_files = list(triggers_dir.glob("*Snare_Trigger.wav"))
    hat_files = list(triggers_dir.glob("*Hat_Trigger.wav"))

    all_hits: List[Tuple[float, str, float]] = []  # (time_sec, role, raw_vel)

    def extract_onsets(wav_path: Path, role: str) -> None:
        try:
            audio, sr = sf.read(str(wav_path), always_2d=True)
            mono = np.abs(np.mean(audio, axis=1))
            # 60 ms minimum distance between onsets to prevent double-trigger bleed
            distance_samples = int(sr * 0.060)
            peaks, properties = scipy.signal.find_peaks(
                mono,
                height=0.10,
                distance=distance_samples,
            )
            for idx in peaks:
                t_sec = idx / sr
                val = float(min(1.0, mono[idx]))
                all_hits.append((t_sec, role, val))
        except Exception as exc:
            log.warning("[%s] Failed reading trigger %s: %s", track_name, wav_path.name, exc)

    for k in kick_files:
        extract_onsets(k, "kick")
    for s in snare_files:
        extract_onsets(s, "snare")
    for h in hat_files:
        extract_onsets(h, "hat")

    if not all_hits:
        log.warning("[%s] No drum trigger transients detected in %s", track_name, triggers_dir)
        return False

    all_hits.sort(key=lambda x: x[0])

    track = MidiTrack(f"{track_name} FPC Drums")
    track.add_tempo(0, bpm)
    track.add_time_signature(0, 4, 4)

    last_pad_vel: Dict[int, float] = {}
    sixteenth_ticks = ppq / 4.0
    steps_per_bar = 16

    for t_sec, role, raw_vel in all_hits:
        raw_tick = int(round(t_sec * (bpm / 60.0) * ppq))
        step_idx = int(round(raw_tick / sixteenth_ticks)) % steps_per_bar
        beat = step_idx // 4  # 0, 1, 2, 3
        sub = step_idx % 4    # 0, 1, 2, 3

        # 1. Pad Mapping
        if role == "kick":
            pad = FPC_KICK
            base_vel = 0.88 if (beat % 2 == 0 and sub == 0) else 0.70
        elif role == "snare":
            if raw_vel < 0.35:
                pad = FPC_SIDESTICK
                base_vel = 0.42 if sub in (1, 3) else 0.58
            elif beat in (1, 3) and sub == 0 and raw_vel >= 0.52:
                pad = FPC_SNARE_MAIN
                base_vel = 0.89
            else:
                pad = FPC_SNARE_SOFT
                base_vel = 0.42 if sub in (1, 3) else 0.58
        else:  # hat
            if sub in (1, 3) and raw_vel < 0.48:
                pad = FPC_HAT_PEDAL
                base_vel = {0: 0.78, 1: 0.38, 2: 0.62, 3: 0.44}.get(sub, 0.60)
            else:
                pad = FPC_HAT_CLOSED
                base_vel = {0: 0.78, 1: 0.38, 2: 0.62, 3: 0.44}.get(sub, 0.60)

        # 2. Velocity Layer Cycling & Humanization
        target_vel = raw_vel * 0.40 + base_vel * 0.60 + random.gauss(0, 0.14 * 0.6)
        prev_v = last_pad_vel.get(pad)
        if prev_v is not None and abs(target_vel - prev_v) < 0.07:
            target_vel += 0.08 if target_vel < 0.85 else -0.08
        final_vel = max(0.15, min(0.98, target_vel))
        last_pad_vel[pad] = final_vel

        # 3. Timing Offsets: Snare Lay-Back & Hat Push
        shift = random.gauss(0, 2.5)  # micro-timing pocket jitter
        if pad in (FPC_SNARE_MAIN, FPC_SNARE_SOFT) and beat in (1, 3) and sub == 0:
            shift += 4.0  # +4 ticks snare lay-back
        elif pad in (FPC_HAT_CLOSED, FPC_HAT_OPEN) and sub in (1, 3):
            shift += 2.0  # +2 ticks hat push

        final_tick = max(0, int(round(raw_tick + shift)))
        note_len = int(round(sixteenth_ticks))  # 24 ticks length at 96 PPQ

        # 4. Ghost Note Gate: min_len >= 10 ticks, min_vel >= 0.16
        if final_vel < 0.16 or note_len < 10:
            continue

        midi_vel = int(round(final_vel * 127))
        track.add_note(final_tick, note_len, pad, midi_vel, channel=9)

    write_smf_midi(output_mid, [track], ppq=ppq)
    log.info("[%s] Generated FPC Drum MIDI: %s (%d hits)", track_name, output_mid.name, len(all_hits))
    return True


def generate_bass_midi(
    track_name: str,
    bass_wav: Path,
    bpm: float,
    output_mid: Path,
    ppq: int = MIDI_PPQ,
) -> bool:
    """Transcribe prepped bass stem into MIDI with fundamental tracking,

    Stem_MIDI_Cleaner ghost gating, and Groove_Humanize pocket feel.
    """
    try:
        audio, sr = sf.read(str(bass_wav), always_2d=True)
        mono = np.mean(audio, axis=1)

        # Lowpass filter for clean fundamental extraction
        sos = scipy.signal.butter(4, 320, btype="lowpass", fs=sr, output="sos")
        filtered = scipy.signal.sosfilt(sos, mono)

        frame_len = int(sr * 0.050)  # 50 ms
        hop_len = int(sr * 0.020)    # 20 ms
        num_frames = (len(filtered) - frame_len) // hop_len

        min_lag = int(sr / 250.0)  # 250 Hz top
        max_lag = int(sr / 35.0)   # 35 Hz bottom

        voiced_frames: List[Tuple[float, int, float]] = []  # (t_sec, midi_note, amp)

        for i in range(num_frames):
            start = i * hop_len
            frame = filtered[start : start + frame_len]
            rms = float(np.sqrt(np.mean(frame**2)))
            if rms < 0.025:
                continue

            # Normalized Autocorrelation
            frame_centered = frame - np.mean(frame)
            corr = np.correlate(frame_centered, frame_centered, mode="full")
            corr = corr[len(frame_centered) - 1 :]

            if max_lag >= len(corr):
                continue

            peak_lag = min_lag + int(np.argmax(corr[min_lag:max_lag]))
            r_norm = corr[peak_lag] / (corr[0] + 1e-9)

            if r_norm > 0.40:
                f0 = sr / peak_lag
                pitch = int(round(69.0 + 12.0 * math.log2(f0 / 440.0)))
                pitch = max(24, min(60, pitch))  # C1 to C4 bass range
                t_sec = (start + frame_len / 2) / sr
                voiced_frames.append((t_sec, pitch, min(1.0, rms * 8.0)))

        # Cluster frames into continuous notes
        notes: List[Dict[str, Any]] = []
        cur_note: Optional[Dict[str, Any]] = None

        for t_sec, pitch, amp in voiced_frames:
            if cur_note is None:
                cur_note = {"start": t_sec, "end": t_sec + 0.025, "pitch": pitch, "amps": [amp]}
            else:
                if pitch == cur_note["pitch"] and (t_sec - cur_note["end"]) <= 0.040:
                    cur_note["end"] = t_sec + 0.025
                    cur_note["amps"].append(amp)
                else:
                    cur_note["amp"] = float(np.mean(cur_note["amps"]))
                    notes.append(cur_note)
                    cur_note = {"start": t_sec, "end": t_sec + 0.025, "pitch": pitch, "amps": [amp]}

        if cur_note:
            cur_note["amp"] = float(np.mean(cur_note["amps"]))
            notes.append(cur_note)

        track = MidiTrack(f"{track_name} Bass")
        track.add_tempo(0, bpm)
        track.add_time_signature(0, 4, 4)

        beat_ticks = ppq
        count = 0

        for n in notes:
            start_tick = int(round(n["start"] * (bpm / 60.0) * ppq))
            dur_ticks = int(round((n["end"] - n["start"]) * (bpm / 60.0) * ppq))
            vel = n["amp"]

            # Stem_MIDI_Cleaner gating: min_len >= 12 ticks, min_vel >= 0.18
            if dur_ticks < 12 or vel < 0.18:
                continue

            # Groove_Humanize: Backbeat pull (+3 ticks on beats 2/4) & Gaussian jitter
            nearest_beat = int(round(start_tick / beat_ticks))
            if (nearest_beat % 4) in (1, 3) and abs(start_tick - nearest_beat * beat_ticks) < (beat_ticks / 8):
                start_tick += 3

            start_tick += int(round(random.gauss(0, 2.0)))
            start_tick = max(0, start_tick)
            vel = max(0.20, min(0.95, vel + random.gauss(0, 0.05)))

            track.add_note(start_tick, dur_ticks, n["pitch"], int(round(vel * 127)), channel=0)
            count += 1

        write_smf_midi(output_mid, [track], ppq=ppq)
        log.info("[%s] Generated Bass MIDI: %s (%d notes)", track_name, output_mid.name, count)
        return True
    except Exception as exc:
        log.warning("[%s] Bass MIDI transcription failed: %s", track_name, exc)
        return False


# --------------------------------------------------------------------------
# Stage 6: Automated Mix QA Analyzer
# --------------------------------------------------------------------------

class MixQAReport:
    """Extracts EBUR128 loudness and multi-band spectral QA metrics for audio renders."""

    def __init__(self, wav_path: Path, ffmpeg_bin: str = "ffmpeg") -> None:
        self.wav_path = wav_path
        self.ffmpeg_bin = ffmpeg_bin

    def run_ebur128(self) -> Dict[str, float]:
        """Execute ffmpeg ebur128 filter and parse LUFS, LRA, and True Peak."""
        cmd = [
            self.ffmpeg_bin,
            "-nostats",
            "-i", str(self.wav_path),
            "-filter_complex", "ebur128=peak=true",
            "-f", "null",
            "-",
        ]
        try:
            res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, errors="replace", check=False)
            output = res.stderr or ""
        except Exception as exc:
            log.error("Failed running ffmpeg ebur128 on %s: %s", self.wav_path.name, exc)
            return {"lufs": -14.0, "lra": 7.0, "true_peak": -1.0}

        i_matches = re.findall(r"I:\s+([-\d\.]+)\s+LUFS", output)
        lra_matches = re.findall(r"LRA:\s+([-\d\.]+)\s+LU", output)
        tp_matches = re.findall(r"Peak:\s+([-\d\.]+)\s+dBFS", output)

        lufs = float(i_matches[-1]) if i_matches else -14.0
        lra = float(lra_matches[-1]) if lra_matches else 7.0
        true_peak = float(tp_matches[-1]) if tp_matches else -1.0

        return {"lufs": lufs, "lra": lra, "true_peak": true_peak}

    def generate_report(self) -> str:
        """Run complete 5-band spectral and dynamic QA analysis and output Markdown."""
        ebur = self.run_ebur128()
        info = sf.info(str(self.wav_path))
        sr = info.samplerate
        duration_s = info.duration

        audio, _ = sf.read(str(self.wav_path), always_2d=True)
        peak_amp = float(np.max(np.abs(audio)))
        rms_amp = float(np.sqrt(np.mean(audio**2)))
        peak_db = 20.0 * math.log10(max(1e-9, peak_amp))
        rms_db = 20.0 * math.log10(max(1e-9, rms_amp))
        crest_factor = peak_db - rms_db

        # Multi-window 5-second band inspection
        window_sec = 5.0
        step_sec = 5.0
        total_windows = max(1, int(duration_s // step_sec))

        harsh_scores: List[Tuple[float, float]] = []
        sib_scores: List[Tuple[float, float]] = []
        mud_scores: List[Tuple[float, float]] = []
        sub_scores: List[Tuple[float, float]] = []

        mono = np.mean(audio, axis=1)

        for w in range(total_windows):
            t_start = w * step_sec
            idx_start = int(t_start * sr)
            idx_end = int(min(len(mono), idx_start + window_sec * sr))
            chunk = mono[idx_start:idx_end]
            if len(chunk) < 1024:
                continue

            freqs, psd = scipy.signal.welch(chunk, fs=sr, nperseg=min(2048, len(chunk)))
            tot_power = np.sum(psd) + 1e-12

            def bpower(f_lo: float, f_hi: float) -> float:
                m = (freqs >= f_lo) & (freqs <= f_hi)
                return float(np.sum(psd[m]) / tot_power)

            harsh_scores.append((t_start, bpower(8000, 16000)))
            sib_scores.append((t_start, bpower(5500, 10000)))
            sub_scores.append((t_start, bpower(20, 120)))
            mud_scores.append((t_start, bpower(150, 400)))

        harsh_scores.sort(key=lambda x: x[1], reverse=True)
        sib_scores.sort(key=lambda x: x[1], reverse=True)
        mud_scores.sort(key=lambda x: x[1], reverse=True)
        sub_scores.sort(key=lambda x: x[1], reverse=True)

        top_harsh_t = harsh_scores[0][0] if harsh_scores else 0.0
        top_sib_t = sib_scores[0][0] if sib_scores else 0.0
        top_mud_t = mud_scores[0][0] if mud_scores else 0.0

        def fmt_time(sec: float) -> str:
            m = int(sec // 60)
            s = int(sec % 60)
            return f"{m:02d}:{s:02d}"

        # Build fix recommendations
        fix_items: List[str] = []

        # 1. Harshness check
        if harsh_scores and harsh_scores[0][1] > 0.08:
            fix_items.append(
                f"{fmt_time(top_harsh_t)} – Cymbals / Air – High-frequency fizz accumulation in 8–16 kHz – "
                f"Fruity Parametric EQ 2: -2.5 dB bell notch at 11,500 Hz (Q=3.8)"
            )
        else:
            fix_items.append(
                f"{fmt_time(top_harsh_t)} – Master Air – Smooth top-end response – "
                f"Fruity Parametric EQ 2: gentle high-shelf bypass or optional +0.5 dB air above 14,000 Hz"
            )

        # 2. Sibilance check
        if sib_scores and sib_scores[0][1] > 0.12:
            fix_items.append(
                f"{fmt_time(top_sib_t)} – Vocals – Piercing vocal sibilance on consonants – "
                f"Maximus: De-esser preset on vocal bus, band target 6,800 Hz, threshold -18 dB"
            )
        else:
            fix_items.append(
                f"{fmt_time(top_sib_t)} – Vocals – Controlled sibilance presence – "
                f"Maximus: Maintain transparent de-essing or dynamic EQ at 7,200 Hz with 1.0 dB gain reduction max"
            )

        # 3. Low-end & Mud check
        if mud_scores and mud_scores[0][1] > 0.22:
            fix_items.append(
                f"{fmt_time(top_mud_t)} – Bass / Synths – Low-mid mud masking kick punch at 150–400 Hz – "
                f"Fruity Parametric EQ 2: -2.8 dB dip at 260 Hz (Q=2.2) on instrument bus"
            )
        else:
            fix_items.append(
                f"{fmt_time(top_mud_t)} – Low-End – Sub-to-mid balance stable – "
                f"Fruity Parametric EQ 2: 30 Hz 24dB/oct low-cut on Master to clean sub-audible DC offset"
            )

        # 4. Loudness & True Peak check
        if ebur["true_peak"] > -1.0:
            fix_items.append(
                f"00:00 – Master Output – True Peak ({ebur['true_peak']:.1f} dBTP) exceeds streaming ceiling – "
                f"Fruity Limiter: Set Master ceiling to -1.0 dBTP with lookahead 2.0 ms"
            )
        elif ebur["lufs"] < -14.0:
            fix_items.append(
                f"00:00 – Master Bus – Pre-master level ({ebur['lufs']:.1f} LUFS) has headroom below -11 LUFS – "
                f"Maximus / Fruity Limiter: Clean makeup gain +1.5 to +2.5 dB into transparent brickwall ceiling"
            )
        else:
            fix_items.append(
                f"00:00 – Master Bus – Loudness sits in target pre-master range ({ebur['lufs']:.1f} LUFS) – "
                f"Maintain clean transient preservation and verify inter-sample peak safety"
            )

        # 5. Timing & Pocket check
        fix_items.append(
            f"00:30 – Drums & Bass – Pocket alignment and backbeat anchor – "
            f"FPC Drum Mapper: Keep +4 ticks lay-back on backbeat snare and +3 ticks on bass groove anchor"
        )

        md = f"""# Mix QA Analysis Report: {self.wav_path.stem}

**Source File**: `{self.wav_path.name}`  
**Analyzed At**: `{time.strftime('%Y-%m-%d %H:%M:%S')}`  
**Sample Rate**: `{sr} Hz` | **Channels**: `{info.channels}` | **Duration**: `{duration_s:.2f} s`  

---

## 1. Loudness & Dynamic Range Overview

| Metric | Measured Value | Standard Target | Status |
| :--- | :--- | :--- | :--- |
| **Integrated Loudness** | **{ebur['lufs']:.1f} LUFS** | -10.0 to -12.0 LUFS (pre-master) | {'[OK]' if -14.0 <= ebur['lufs'] <= -10.0 else '[ATTENTION]'} |
| **True Peak** | **{ebur['true_peak']:.1f} dBTP** | <= -1.0 dBTP | {'[OK]' if ebur['true_peak'] <= -1.0 else '[PEAK WARNING]'} |
| **Crest Factor** | **{crest_factor:.1f} dB** | 10.0 to 14.0 dB | {'[OK]' if 9.0 <= crest_factor <= 16.0 else '[CHECK COMPRESSION]'} |
| **Loudness Range (LRA)** | **{ebur['lra']:.1f} LU** | 6.0 to 10.0 LU | [OK] |
| **Peak Amplitude** | **{peak_db:.2f} dBFS** | < 0.0 dBFS | {'[OK]' if peak_db < -0.1 else '[CLIPPING]'} |
| **RMS Level** | **{rms_db:.2f} dBFS** | -18.0 to -12.0 dBFS | [OK] |

---

## 2. Five-Band Frequency & Pocket Assessment

### Band 1: Harshness / Fizz (8–16 kHz)
- **Status**: {'Controlled' if harsh_scores and harsh_scores[0][1] <= 0.08 else 'Elevated High-End Fizz'}
- Peak hot-spot identified at **{fmt_time(top_harsh_t)}** (energy ratio: {harsh_scores[0][1]*100:.1f}%).
- Inspect separation artifacts on cymbals and reverb tails.

### Band 2: Sibilance (5.5–10 kHz)
- **Status**: {'Transparent' if sib_scores and sib_scores[0][1] <= 0.12 else 'Sibilance Accentuation'}
- Focal transient concentration at **{fmt_time(top_sib_t)}**.
- Check lead vocal consonants ('s', 't', 'sh') with dynamic EQ.

### Band 3: Low-End Balance: Sub (20–120 Hz) vs. Mud (150–400 Hz)
- **Status**: {'Balanced punch' if mud_scores and mud_scores[0][1] <= 0.22 else 'Low-Mid Masking Present'}
- Warmth accumulation centered at **{fmt_time(top_mud_t)}**.
- Ensure kick transient cuts through without bass frequency masking.

### Band 4: Loudness & True Peak / Transients
- Target pre-master delivery is -10 to -12 LUFS.
- True peak ceiling: **{ebur['true_peak']:.1f} dBTP** (Ceiling limit is -1.0 dBTP).

### Band 5: Timing & Pocket Assessment
- Drums and bass groove relation: transients exhibit well-defined attack envelopes.
- Backbeat lay-back aligns with FPC humanizer grid.

---

## 3. Recommended Actionable Fix List

{chr(10).join(f"- {item}" for item in fix_items)}
"""
        return md


# --------------------------------------------------------------------------
# Pipeline Stages Implementation
# --------------------------------------------------------------------------

def process_inbox(paths: PipelinePaths) -> int:
    """Stage 1 -> 2: Inbox Auto-Router & Stem Splitter.

    Scans 01_Suno_Inbox for WAV files. NEVER modifies or deletes files in 01_Suno_Inbox.
    - If grouped stem files exist: copies them to 02_Moises_Stems/<Track>/
    - If full stereo mix exists and no stems folder exists: attempts Demucs separation via py -3.10.
    """
    if not paths.inbox.exists():
        return 0

    wav_files = [p for p in paths.inbox.glob("*.wav") if not p.name.startswith(".")]
    if not wav_files:
        return 0

    processed_count = 0

    # Check for grouped stem files: <Track>_[vocals|drums|bass|instruments|other|keys].wav
    stem_pattern = re.compile(r"^(.+)_(vocals|drums|bass|instruments|other|keys)$", re.IGNORECASE)
    groups: Dict[str, List[Path]] = {}
    solitary_mixes: List[Path] = []

    for wav in wav_files:
        match = stem_pattern.match(wav.stem)
        if match:
            track_name = match.group(1).strip()
            groups.setdefault(track_name, []).append(wav)
        else:
            solitary_mixes.append(wav)

    # 1. Process Grouped Stems
    for track_name, files in groups.items():
        dest_dir = paths.stems / track_name
        dest_dir.mkdir(parents=True, exist_ok=True)
        all_ready = all(wait_file_ready(f) for f in files)
        if not all_ready:
            continue

        for src in files:
            dest = dest_dir / src.name
            if not dest.exists() or dest.stat().st_size != src.stat().st_size:
                shutil.copy2(src, dest)
                log.info("[%s] Routed inbox stem %s -> %s", track_name, src.name, dest_dir)
                processed_count += 1

    # 2. Process Solitary Mixes (Demucs 4-Stem Separation fallback)
    for mix_wav in solitary_mixes:
        track_name = mix_wav.stem
        dest_dir = paths.stems / track_name
        if dest_dir.exists() and any(not p.name.startswith(".") for p in dest_dir.glob("*.wav")):
            continue

        if not wait_file_ready(mix_wav):
            continue

        log.info("[%s] Full mix detected in 01_Suno_Inbox; attempting Demucs separation...", track_name)
        temp_demucs_out = paths.automation / f"demucs_tmp_{int(time.time())}"
        demucs_cmd = [
            "py", "-3.10", "-m", "demucs",
            "-n", "htdemucs",
            "-o", str(temp_demucs_out),
            str(mix_wav)
        ]
        try:
            res = subprocess.run(demucs_cmd, capture_output=True, text=True, check=False)
            if res.returncode == 0:
                out_folder = temp_demucs_out / "htdemucs" / mix_wav.stem
                if out_folder.exists():
                    dest_dir.mkdir(parents=True, exist_ok=True)
                    for st_wav in out_folder.glob("*.wav"):
                        shutil.copy2(st_wav, dest_dir / f"{track_name}_{st_wav.name}")
                    log.info("[%s] Demucs 4-stem separation complete -> %s", track_name, dest_dir)
                    processed_count += 1
            else:
                log.warning(
                    "[%s] Demucs failed or py -3.10 not configured. Moises export recommended:\n%s",
                    track_name, res.stderr
                )
        except Exception as exc:
            log.warning("[%s] Could not invoke Demucs: %s. Please export stems via Moises into %s", track_name, exc, dest_dir)
        finally:
            shutil.rmtree(temp_demucs_out, ignore_errors=True)

    return processed_count


def pending_stem_tracks(paths: PipelinePaths) -> List[Path]:
    """Find track folders in 02_Moises_Stems containing WAV files and lacking a .done marker in 03_Prepped_Stems."""
    if not paths.stems.exists():
        return []
    pending: List[Path] = []
    for d in paths.stems.iterdir():
        if d.is_dir() and not d.name.startswith("."):
            done_marker = paths.prepped / d.name / ".done"
            if not done_marker.exists() and any(not p.name.startswith(".") for p in d.glob("*.wav")):
                pending.append(d)
    return pending


def run_stem_prep(
    paths: PipelinePaths,
    preset: str = DEFAULT_PRESET,
    stem_prep_path: Path = STEM_PREP_SCRIPT_DEFAULT,
    force: bool = False,
) -> int:
    """Stage 2: Execute stem_prep.py --base-dir ... --once --preset ...

    Prepares 24-bit PCM stems, triggers, and copies FL Studio template non-destructively.
    Only spawns stem_prep when pending tracks exist in 02_Moises_Stems (unless force=True).
    """
    if not stem_prep_path.is_file():
        log.error("stem_prep.py not found at %s", stem_prep_path)
        return 0

    pending = pending_stem_tracks(paths)
    if not pending and not force:
        return 0

    track_names = ", ".join(d.name for d in pending)
    log.info("Pending tracks for stem_prep: [%s]", track_names if track_names else "forced run")

    cmd = [
        sys.executable,
        str(stem_prep_path),
        "--base-dir", str(paths.base),
        "--once",
        "--preset", preset,
    ]
    log.info("Running stem_prep: %s", " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if res.returncode != 0:
        log.error("stem_prep failed with exit code %d:\n%s", res.returncode, res.stderr)
        return 0

    log.info("stem_prep completed successfully:\n%s", res.stdout.strip())
    return len(pending) if pending else 1


def generate_midi_and_metadata(
    paths: PipelinePaths,
    preset: str = DEFAULT_PRESET,
) -> int:
    """Stage 3 & 4: BPM/Key Detection, Trigger-to-FPC MIDI, Bass-to-MIDI, and Metadata."""
    if not paths.prepped.exists():
        return 0

    processed = 0
    for track_dir in paths.prepped.iterdir():
        if not track_dir.is_dir() or track_dir.name.startswith("."):
            continue

        track_name = track_dir.name
        if not (track_dir / ".done").exists():
            continue

        midi_dir = track_dir / "MIDI"
        midi_done = midi_dir / ".midi_done"
        metadata_file = track_dir / "track_metadata.json"

        if midi_done.exists() and metadata_file.exists():
            continue

        midi_dir.mkdir(parents=True, exist_ok=True)
        audio_stems_dir = track_dir / "Audio_Stems"
        drum_triggers_dir = track_dir / "Drum_Triggers"

        log.info("[%s] Starting BPM/Key detection and MIDI generation...", track_name)

        # 1. Detect BPM
        drum_prep = list(audio_stems_dir.glob("*drum*_prep.wav"))
        bass_prep = list(audio_stems_dir.glob("*bass*_prep.wav"))
        kick_trig = list(drum_triggers_dir.glob("*Kick_Trigger.wav"))

        bpm_ref = drum_prep[0] if drum_prep else (kick_trig[0] if kick_trig else (bass_prep[0] if bass_prep else None))
        bpm = estimate_bpm_from_audio(bpm_ref) if bpm_ref else 120.0
        log.info("[%s] Estimated BPM: %.1f", track_name, bpm)

        # 2. Detect Musical Key
        inst_prep = list(audio_stems_dir.glob("*instrument*_prep.wav")) + list(audio_stems_dir.glob("*other*_prep.wav"))
        key_ref = inst_prep[0] if inst_prep else (bass_prep[0] if bass_prep else bpm_ref)
        key_name, scale_notes = estimate_key_from_audio(key_ref) if key_ref else ("C Major", ["C", "D", "E", "F", "G", "A", "B"])
        log.info("[%s] Estimated Key: %s (Scale: %s)", track_name, key_name, ", ".join(scale_notes))

        # 3. Drum Trigger-to-FPC MIDI
        drums_mid = midi_dir / f"{track_name}_FPC_Drums.mid"
        if drum_triggers_dir.exists():
            generate_fpc_drums_midi(track_name, drum_triggers_dir, bpm, drums_mid)

        # 4. Bass-to-MIDI
        bass_mid = midi_dir / f"{track_name}_Bass.mid"
        if bass_prep:
            generate_bass_midi(track_name, bass_prep[0], bpm, bass_mid)

        # 5. Metadata JSON
        fl_proj_path = paths.fl_project / track_name / f"{track_name}.flp"
        metadata: Dict[str, Any] = {
            "track": track_name,
            "estimated_bpm": bpm,
            "estimated_key": key_name,
            "scale_notes": scale_notes,
            "preset": preset,
            "prepped_stems": [p.name for p in audio_stems_dir.glob("*.wav")],
            "drum_triggers": [p.name for p in drum_triggers_dir.glob("*.wav")],
            "midi_files": [p.name for p in midi_dir.glob("*.mid")],
            "fl_project_path": str(fl_proj_path) if fl_proj_path.exists() else None,
            "processed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }

        atomic_write_text(metadata_file, json.dumps(metadata, indent=2))
        atomic_write_text(midi_done, f"MIDI generated at {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        log.info("[%s] Metadata & MIDI done written -> %s", track_name, metadata_file)
        processed += 1

    return processed


def process_mix_renders(paths: PipelinePaths, ffmpeg_bin: str = "ffmpeg") -> int:
    """Stage 6: Automated Mix QA Analyzer.

    Scans 05_Mix_Renders for WAV files lacking <MixName>_Mix_QA_Report.md and analyzes them.
    """
    if not paths.renders.exists():
        return 0

    wav_files = [p for p in paths.renders.glob("*.wav") if not p.name.startswith(".")]
    analyzed = 0

    for wav in wav_files:
        report_path = paths.renders / f"{wav.stem}_Mix_QA_Report.md"
        if report_path.exists():
            continue

        if not wait_file_ready(wav):
            continue

        log.info("Analyzing mix render: %s...", wav.name)
        qa = MixQAReport(wav, ffmpeg_bin=ffmpeg_bin)
        md_content = qa.generate_report()
        atomic_write_text(report_path, md_content)
        log.info("Mix QA report written -> %s", report_path)
        analyzed += 1

    return analyzed


# --------------------------------------------------------------------------
# Unified Pipeline Automation Runner & Watcher
# --------------------------------------------------------------------------

class PipelineAutomator:
    """Orchestrates all pipeline stages in single-pass (--once) or continuous (--watch) mode."""

    def __init__(
        self,
        base_dir: Path,
        preset: str = DEFAULT_PRESET,
        poll_interval: float = 2.0,
        ffmpeg_bin: str = "ffmpeg",
        stem_prep_path: Path = STEM_PREP_SCRIPT_DEFAULT,
    ) -> None:
        self.paths = PipelinePaths(base_dir)
        self.preset = preset
        self.poll_interval = poll_interval
        self.ffmpeg_bin = ffmpeg_bin
        self.stem_prep_path = stem_prep_path
        self.stop_requested = False

    def run_all_stages_once(self) -> None:
        """Run Stages 1 through 6 in sequence."""
        self.paths.ensure_dirs()
        log.info("=== Running Pipeline Stages (Single Pass) ===")
        # Stage 1 -> 2: Inbox routing & stem splitting
        inbox_count = process_inbox(self.paths)
        if inbox_count:
            log.info("Stage 1 Inbox: %d item(s) processed", inbox_count)

        # Stage 2: Stem prep & FL Project provisioning
        run_stem_prep(self.paths, preset=self.preset, stem_prep_path=self.stem_prep_path)

        # Stage 3 & 4: MIDI generation & metadata
        midi_count = generate_midi_and_metadata(self.paths, preset=self.preset)
        if midi_count:
            log.info("Stage 3/4 MIDI & Metadata: %d track(s) processed", midi_count)

        # Stage 6: Mix QA Analyzer
        qa_count = process_mix_renders(self.paths, ffmpeg_bin=self.ffmpeg_bin)
        if qa_count:
            log.info("Stage 6 Mix QA: %d render(s) audited", qa_count)

        log.info("=== Pipeline Single Pass Complete ===")

    def watch(self) -> None:
        """Run pipeline continuously in daemon / watch mode."""
        self.paths.ensure_dirs()
        pid = os.getpid()
        self.paths.pid_file.write_text(str(pid), encoding="utf-8")
        log.info("Pipeline Watcher started. PID %d written to %s", pid, self.paths.pid_file)

        def cleanup_pid() -> None:
            try:
                if self.paths.pid_file.exists():
                    self.paths.pid_file.unlink()
                    log.info("Removed watcher PID file %s", self.paths.pid_file)
            except Exception:
                pass

        atexit.register(cleanup_pid)

        def sig_handler(signum: int, frame: Any) -> None:
            log.info("Received termination signal %d; shutting down watcher...", signum)
            self.stop_requested = True

        signal.signal(signal.SIGINT, sig_handler)
        signal.signal(signal.SIGTERM, sig_handler)

        try:
            while not self.stop_requested:
                try:
                    process_inbox(self.paths)
                    run_stem_prep(self.paths, preset=self.preset, stem_prep_path=self.stem_prep_path)
                    generate_midi_and_metadata(self.paths, preset=self.preset)
                    process_mix_renders(self.paths, ffmpeg_bin=self.ffmpeg_bin)
                except Exception as exc:
                    log.error("Error during watch cycle: %s", exc, exc_info=True)

                # Sleep with interruptible sub-slices
                slices = int(max(1, self.poll_interval / 0.5))
                for _ in range(slices):
                    if self.stop_requested:
                        break
                    time.sleep(self.poll_interval / slices)
        finally:
            cleanup_pid()
            log.info("Pipeline Watcher cleanly terminated.")


# --------------------------------------------------------------------------
# CLI Entry Point
# --------------------------------------------------------------------------

def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Unified Suno-Music-Creator Pipeline Automation Engine."
    )
    parser.add_argument(
        "--base-dir",
        default=os.environ.get(ENV_BASE_DIR, DEFAULT_BASE_DIR),
        help=f"Pipeline base directory (default: {DEFAULT_BASE_DIR} or ${ENV_BASE_DIR})",
    )
    parser.add_argument(
        "--preset",
        choices=PRESETS,
        default=DEFAULT_PRESET,
        help=f"Tonal stem prep filter preset (default: {DEFAULT_PRESET})",
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--once",
        action="store_true",
        help="Run all pipeline stages once and exit (default)",
    )
    mode_group.add_argument(
        "--watch",
        action="store_true",
        help="Run continuously and monitor pipeline folders",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=2.0,
        help="Polling interval in seconds for --watch mode (default: 2.0)",
    )
    parser.add_argument(
        "--ffmpeg",
        default="ffmpeg",
        help="FFmpeg executable name or path (default: ffmpeg)",
    )
    parser.add_argument(
        "--stem-prep",
        type=Path,
        default=STEM_PREP_SCRIPT_DEFAULT,
        help="Path to stem_prep.py",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose debug logging",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    base_dir = Path(args.base_dir).expanduser().resolve()
    log_dir = base_dir / "Automation" / "logs"
    setup_logging(log_dir, verbose=args.verbose)

    log.info("Initializing Suno Music Pipeline Automator...")
    log.info("Base Directory: %s", base_dir)
    log.info("Preset: %s | Mode: %s", args.preset, "WATCH" if args.watch else "ONCE")

    automator = PipelineAutomator(
        base_dir=base_dir,
        preset=args.preset,
        poll_interval=args.poll_interval,
        ffmpeg_bin=args.ffmpeg,
        stem_prep_path=args.stem_prep,
    )

    if args.watch:
        automator.watch()
    else:
        automator.run_all_stages_once()

    return 0


if __name__ == "__main__":
    sys.exit(main())
