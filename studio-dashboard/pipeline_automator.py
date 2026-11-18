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

Requires numpy, scipy and soundfile. Includes a pure-Python Standard MIDI File
(SMF) writer and a built-in ITU-R BS.1770 loudness meter, so ffmpeg is optional
for analysis (it is still used for transcoding and by stem_prep.py).
"""

from __future__ import annotations

import argparse
import atexit
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import math
import os
from pathlib import Path
import random
import re
import shlex
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import threading
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import scipy.ndimage
import scipy.signal
import soundfile as sf

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

    @property
    def failures_file(self) -> Path:
        return self.automation / "failures.json"

    def ensure_dirs(self) -> None:
        for d in [self.inbox, self.stems, self.prepped, self.fl_project, self.renders, self.templates, self.automation, self.logs]:
            d.mkdir(parents=True, exist_ok=True)


def stem_kind(wav: Path, track: str) -> str:
    name = wav.stem.lower().removeprefix(track.lower() + "_")
    for kind, keywords in STEM_KEYWORDS:
        if any(keyword in name for keyword in keywords):
            return kind
    return "instruments"


def visible_wavs(folder: Path) -> List[Path]:
    """Sorted list of non-hidden .wav files directly inside folder (empty if missing)."""
    if not folder.is_dir():
        return []
    return sorted(p for p in folder.glob("*.wav") if not p.name.startswith("."))


def visible_dirs(folder: Path) -> List[Path]:
    """Sorted list of non-hidden sub-directories of folder (empty if missing)."""
    if not folder.is_dir():
        return []
    return sorted(d for d in folder.iterdir() if d.is_dir() and not d.name.startswith("."))


# --------------------------------------------------------------------------
# Render naming: one place that decides which render belongs to which track
# --------------------------------------------------------------------------

RENDER_SUFFIXES = ("_RoughMix", "_Humanized", "_Mix", "_Master")
_RENDER_SUFFIX_RE = re.compile(r"(" + "|".join(RENDER_SUFFIXES) + r")$", re.IGNORECASE)
QA_REPORT_SUFFIX = "_Mix_QA_Report.md"


def render_track_name(render_stem: str) -> str:
    """Map a render file stem to its track name ('Song_RoughMix' -> 'Song')."""
    return _RENDER_SUFFIX_RE.sub("", render_stem) or render_stem


def render_kind(render_stem: str) -> str:
    """Classify a render: 'humanized', 'rough' or 'render' (an export from FL Studio)."""
    low = render_stem.lower()
    if low.endswith("_humanized"):
        return "humanized"
    if low.endswith("_roughmix"):
        return "rough"
    return "render"


def qa_report_path(render_wav: Path) -> Path:
    return render_wav.with_name(f"{render_wav.stem}{QA_REPORT_SUFFIX}")


def renders_for_track(paths: "PipelinePaths", track_name: str) -> List[Path]:
    """Render WAVs in 05_Mix_Renders that belong to exactly this track (no prefix matching)."""
    return [w for w in visible_wavs(paths.renders) if render_track_name(w.stem) == track_name]


# --------------------------------------------------------------------------
# Failure registry: stops the watcher retrying a broken step every poll
# --------------------------------------------------------------------------

def fingerprint(files: Sequence[Path]) -> str:
    """Stable signature of a set of input files (name, size, mtime).

    A recorded failure is only retried once its inputs change (or the user
    clears it via Re-Process), so a broken file can't cause a retry loop.
    """
    h = hashlib.sha1()
    for f in sorted(files, key=lambda x: str(x)):
        try:
            st = f.stat()
            h.update(f"{f.name}|{st.st_size}|{st.st_mtime_ns};".encode("utf-8"))
        except OSError:
            h.update(f"{f.name}|missing;".encode("utf-8"))
    return h.hexdigest()[:16]


class FailureRegistry:
    """Persistent record of failed (stage, track) steps in Automation/failures.json."""

    _lock = threading.Lock()

    def __init__(self, path: Path) -> None:
        self.path = path

    def _load(self) -> Dict[str, Dict[str, Any]]:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, ValueError):
            return {}

    def _save(self, data: Dict[str, Dict[str, Any]]) -> None:
        atomic_write_text(self.path, json.dumps(data, indent=2))

    @staticmethod
    def _key(stage: str, track: str) -> str:
        return f"{stage}::{track}"

    def record(self, stage: str, track: str, signature: str, error: str) -> None:
        with self._lock:
            data = self._load()
            key = self._key(stage, track)
            attempts = int(data.get(key, {}).get("attempts", 0)) + 1
            data[key] = {
                "stage": stage,
                "track": track,
                "signature": signature,
                "error": str(error)[-2000:],
                "attempts": attempts,
                "failed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }
            self._save(data)
        log.error("[%s] %s failed (will not retry until inputs change or Re-Process): %s", track, stage, str(error)[-500:])

    def is_blocked(self, stage: str, track: str, signature: str) -> bool:
        entry = self._load().get(self._key(stage, track))
        return bool(entry) and entry.get("signature") == signature

    def clear(self, stage: Optional[str] = None, track: Optional[str] = None) -> None:
        with self._lock:
            data = self._load()
            keep = {
                k: v for k, v in data.items()
                if not ((stage is None or v.get("stage") == stage) and (track is None or v.get("track") == track))
            }
            if keep != data:
                self._save(keep)

    def for_track(self, track: str) -> List[Dict[str, Any]]:
        return [v for v in self._load().values() if v.get("track") == track]

    def all(self) -> List[Dict[str, Any]]:
        return list(self._load().values())


def failures(paths: "PipelinePaths") -> FailureRegistry:
    return FailureRegistry(paths.failures_file)


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

def detect_onsets(
    mono: np.ndarray,
    sr: int,
    min_gap_sec: float = 0.060,
    rel_threshold: float = 0.15,
) -> Tuple[np.ndarray, np.ndarray]:
    """Detect transient onsets on an amplitude envelope (not raw sample peaks).

    Returns (onset_sample_indices, relative_strength 0..1). The threshold is
    relative to the loudest hit, so quiet and loud stems behave the same.
    """
    if mono.size == 0:
        return np.zeros(0, dtype=int), np.zeros(0)
    rect = np.abs(mono.astype(np.float64))
    win = max(1, int(sr * 0.005))
    env = scipy.ndimage.maximum_filter1d(rect, size=win)
    env = scipy.ndimage.uniform_filter1d(env, size=win)
    peak = float(env.max())
    if peak <= 1e-6:
        return np.zeros(0, dtype=int), np.zeros(0)
    peaks, _ = scipy.signal.find_peaks(
        env,
        height=peak * rel_threshold,
        distance=max(1, int(sr * min_gap_sec)),
        prominence=peak * rel_threshold * 0.5,
    )
    if peaks.size == 0:
        return peaks, np.zeros(0)
    # Walk back from each envelope peak to where the attack starts (~20% of peak).
    onsets = np.empty_like(peaks)
    max_back = int(sr * 0.030)
    for i, p in enumerate(peaks):
        floor = env[p] * 0.2
        j = p
        lim = max(0, p - max_back)
        while j > lim and env[j - 1] > floor:
            j -= 1
        onsets[i] = j
    strength = np.clip(env[peaks] / peak, 0.0, 1.0)
    return onsets, strength


def estimate_downbeat_offset(onset_times: Sequence[float], bpm: float) -> float:
    """Return the time (sec) of the first beat of the grid.

    Uses the earliest strong kick onset, folded back to the start of the
    song by whole beats so a pickup or silent intro doesn't shift beats 2/4.
    """
    if not onset_times:
        return 0.0
    beat = 60.0 / max(1.0, bpm)
    first = float(min(onset_times))
    return first - beat * math.floor(first / beat)


def refine_tempo(onset_times: Sequence[float], bpm: float) -> Tuple[float, float]:
    """Fit tempo and downbeat to the actual hit times (least squares on beat indices).

    The autocorrelation BPM is only accurate to ~0.5 BPM, which drifts the
    grid by a beat or more over a whole song. Fitting the kick/snare onsets
    to integer beat numbers pins the grid to what the drummer played.
    Returns (bpm, downbeat_sec); falls back to the input when there's too little data.
    """
    times = np.sort(np.asarray(onset_times, dtype=np.float64))
    if times.size < 8:
        return bpm, estimate_downbeat_offset(list(times), bpm)
    beat = 60.0 / bpm
    t0 = float(times[0])
    for _ in range(3):
        idx = np.round((times - t0) / beat)
        # Only fit hits that sit close to a beat (ignore off-beat kicks / fills)
        resid = (times - t0) - idx * beat
        keep = np.abs(resid) < beat * 0.2
        if keep.sum() < 8 or np.ptp(idx[keep]) < 4:
            break
        slope, intercept = np.polyfit(idx[keep], times[keep], 1)
        if not (60.0 / 200.0 < slope < 60.0 / 60.0):
            break
        beat, t0 = float(slope), float(intercept)
    new_bpm = round(60.0 / beat, 2)
    if abs(new_bpm - bpm) > 3.0:  # a bigger jump means the fit locked onto something else
        return bpm, estimate_downbeat_offset(list(times), bpm)
    return new_bpm, t0 - beat * math.floor(t0 / beat)


def grid_position(t_sec: float, bpm: float, downbeat_sec: float) -> Tuple[int, int, int]:
    """(bar_step 0..15, beat 0..3, sixteenth-in-beat 0..3) for a time on the 4/4 grid."""
    sixteenth = 60.0 / max(1.0, bpm) / 4.0
    step = int(round((t_sec - downbeat_sec) / sixteenth)) % 16
    return step, step // 4, step % 4


def _sec_to_tick(t_sec: float, bpm: float, ppq: int) -> int:
    return max(0, int(round(t_sec * (bpm / 60.0) * ppq)))


def notes_to_midi_track(
    name: str,
    notes: Sequence[Dict[str, Any]],
    bpm: float,
    channel: int,
    ppq: int = MIDI_PPQ,
) -> MidiTrack:
    """Build a MidiTrack from note dicts {start, dur (sec), pitch, vel (0..1)}."""
    track = MidiTrack(name)
    track.add_tempo(0, bpm)
    track.add_time_signature(0, 4, 4)
    for n in notes:
        start = _sec_to_tick(n["start"], bpm, ppq)
        length = max(1, _sec_to_tick(n["start"] + n["dur"], bpm, ppq) - start)
        track.add_note(start, length, int(n["pitch"]), int(round(max(0.0, min(1.0, n["vel"])) * 127)), channel=channel)
    return track


def transcribe_drum_hits(
    track_name: str,
    triggers_dir: Path,
    bpm: float,
    downbeat_sec: Optional[float] = None,
) -> Tuple[List[Dict[str, Any]], float, float]:
    """Transcribe Kick/Snare/Hat trigger WAVs into clean FPC note dicts.

    Deterministic: no random jitter. Groove/feel is applied separately by
    humanized_mix.humanize_notes() (or the FL Studio .pyscript tools).
    When downbeat_sec is None the tempo is refined from the hits.
    Returns (notes, downbeat_sec, bpm).
    """
    roles = (("kick", "*Kick_Trigger.wav"), ("snare", "*Snare_Trigger.wav"), ("hat", "*Hat_Trigger.wav"))
    candidates: List[Tuple[float, str, float, float]] = []
    for role, pattern in roles:
        for wav in sorted(triggers_dir.glob(pattern)):
            try:
                audio, sr = sf.read(str(wav), always_2d=True)
            except Exception as exc:
                log.warning("[%s] Failed reading trigger %s: %s", track_name, wav.name, exc)
                continue
            mono = np.mean(audio, axis=1)
            onsets, strength = detect_onsets(mono, sr)
            for idx, velocity in zip(onsets, strength):
                attack = mono[idx:idx + max(1, round(sr * 0.035))]
                level = float(np.max(np.abs(attack)))
                candidates.append((idx / sr, role, float(velocity), level))

    if not candidates:
        return [], 0.0 if downbeat_sec is None else downbeat_sec, bpm

    candidates.sort(key=lambda h: h[0])

    # De-bleed simultaneous cross-trigger hits (kick <-> snare within 18 ms)
    drop = set()
    for i, (ti, ri, _, vi) in enumerate(candidates):
        if ri not in ("kick", "snare") or i in drop:
            continue
        for j in range(i + 1, len(candidates)):
            tj, rj, _, vj = candidates[j]
            if tj - ti > 0.018:
                break
            if rj not in ("kick", "snare") or rj == ri or j in drop:
                continue
            if vi < vj * 0.65:
                drop.add(i)
                break
            if vj < vi * 0.65:
                drop.add(j)
    hits = [(t, role, velocity) for idx, (t, role, velocity, _) in enumerate(candidates) if idx not in drop]

    # Align remaining cross-role hits within 12 ms to the strongest hit's timestamp
    aligned: List[Tuple[float, str, float]] = []
    idx = 0
    n_hits = len(hits)
    while idx < n_hits:
        t0 = hits[idx][0]
        end = idx + 1
        while end < n_hits and hits[end][0] - t0 <= 0.012:
            end += 1
        cluster = hits[idx:end]
        if len({r for _, r, _ in cluster}) > 1:
            anchor_t = max(cluster, key=lambda h: h[2])[0]
            aligned.extend((anchor_t, r, v) for _, r, v in cluster)
        else:
            aligned.extend(cluster)
        idx = end
    hits = sorted(aligned, key=lambda h: h[0])

    if downbeat_sec is None:
        anchors = [t for t, r, v in hits if r in ("kick", "snare") and v >= 0.4]
        bpm, downbeat_sec = refine_tempo(anchors or [hits[0][0]], bpm)
        strong_kicks = [t for t, r, v in hits if r == "kick" and v >= 0.5]
        if strong_kicks:
            # Bar 1 starts on a kick: shift the beat grid phase to the first strong kick's beat.
            beat = 60.0 / bpm
            k = round((strong_kicks[0] - downbeat_sec) / beat)
            downbeat_sec = (downbeat_sec + k * beat) % (beat * 4)

    sixteenth = 60.0 / max(1.0, bpm) / 4.0
    notes: List[Dict[str, Any]] = []
    for t_sec, role, raw_vel in hits:
        _, beat, sub = grid_position(t_sec, bpm, downbeat_sec)
        if role == "kick":
            pad = FPC_KICK
        elif role == "snare":
            if raw_vel < 0.35:
                pad = FPC_SIDESTICK
            elif beat in (1, 3) and sub == 0 and raw_vel >= 0.52:
                pad = FPC_SNARE_MAIN
            else:
                pad = FPC_SNARE_SOFT
        else:
            pad = FPC_HAT_PEDAL if (sub in (1, 3) and raw_vel < 0.30) else FPC_HAT_CLOSED

        vel = 0.25 + 0.70 * raw_vel  # map relative strength into a playable velocity range
        if vel < 0.16:
            continue  # ghost-note gate
        notes.append({"start": t_sec, "dur": sixteenth, "pitch": pad, "vel": vel, "role": role})
    return notes, downbeat_sec, bpm


def generate_fpc_drums_midi(
    track_name: str,
    triggers_dir: Path,
    bpm: float,
    output_mid: Path,
    ppq: int = MIDI_PPQ,
    downbeat_sec: Optional[float] = None,
) -> bool:
    """Write clean (un-humanized) FPC drum MIDI from Kick/Snare/Hat trigger WAVs."""
    notes, _, bpm = transcribe_drum_hits(track_name, triggers_dir, bpm, downbeat_sec)
    if not notes:
        log.warning("[%s] No drum trigger transients detected in %s", track_name, triggers_dir)
        return False
    write_smf_midi(output_mid, [notes_to_midi_track(f"{track_name} FPC Drums", notes, bpm, channel=9, ppq=ppq)], ppq=ppq)
    log.info("[%s] Generated FPC Drum MIDI: %s (%d hits)", track_name, output_mid.name, len(notes))
    return True


def _yin_pitch(frame: np.ndarray, sr: int, f_min: float, f_max: float, threshold: float = 0.15) -> Optional[float]:
    """YIN fundamental estimate for one frame; None if unvoiced.

    Uses the cumulative-mean-normalised difference, which avoids the octave
    errors that plain autocorrelation argmax makes on bass.
    """
    n = frame.size
    tau_min = max(2, int(sr / f_max))
    tau_max = min(n // 2, int(sr / f_min))
    if tau_max <= tau_min + 2:
        return None
    # Difference function via FFT autocorrelation: d(tau) = r0(0) + r_tau(0) - 2 r(tau)
    w = n - tau_max
    x = frame.astype(np.float64)
    fft_len = 1 << int(math.ceil(math.log2(2 * n)))
    spec = np.fft.rfft(x, fft_len)
    acf = np.fft.irfft(spec * np.conj(spec), fft_len)[: tau_max + 1]
    sq = np.concatenate(([0.0], np.cumsum(x * x)))
    energy0 = sq[w]
    taus = np.arange(tau_max + 1)
    energy_tau = sq[taus + w] - sq[taus]
    diff = energy0 + energy_tau - 2.0 * acf
    diff[0] = 0.0
    cmnd = np.ones_like(diff)
    running = np.cumsum(diff[1:])
    cmnd[1:] = diff[1:] * np.arange(1, tau_max + 1) / np.maximum(running, 1e-12)
    below = np.where(cmnd[tau_min:tau_max] < threshold)[0]
    if below.size == 0:
        return None
    tau = tau_min + int(below[0])
    while tau + 1 < tau_max and cmnd[tau + 1] < cmnd[tau]:
        tau += 1
    # Parabolic refinement
    if 1 <= tau < tau_max:
        a, b, c = cmnd[tau - 1], cmnd[tau], cmnd[tau + 1]
        den = a - 2 * b + c
        shift = 0.5 * (a - c) / den if abs(den) > 1e-12 else 0.0
    else:
        shift = 0.0
    return sr / (tau + shift)


def transcribe_bass_notes(bass_wav: Path) -> List[Dict[str, Any]]:
    """Transcribe a bass stem into clean note dicts {start, dur, pitch, vel}.

    YIN pitch tracking on 50 ms frames with a level gate relative to the
    stem's own loudness (so a quiet bass stem still transcribes).
    """
    audio, sr = sf.read(str(bass_wav), always_2d=True)
    mono = np.mean(audio, axis=1)
    sos = scipy.signal.butter(4, 400, btype="lowpass", fs=sr, output="sos")
    filtered = scipy.signal.sosfilt(sos, mono)

    frame_len = int(sr * 0.050)
    hop_len = int(sr * 0.020)
    if len(filtered) < frame_len:
        return []
    num_frames = (len(filtered) - frame_len) // hop_len + 1
    starts = np.arange(num_frames) * hop_len
    rms = np.array([np.sqrt(np.mean(filtered[s : s + frame_len] ** 2)) for s in starts])
    loud_ref = float(np.percentile(rms, 95)) if rms.size else 0.0
    if loud_ref <= 1e-5:
        return []
    gate = loud_ref * 0.12

    voiced: List[Tuple[float, int, float]] = []
    for s, r in zip(starts, rms):
        if r < gate:
            continue
        f0 = _yin_pitch(filtered[s : s + frame_len], sr, 30.0, 300.0)
        if not f0 or f0 <= 0:
            continue
        pitch = int(round(69.0 + 12.0 * math.log2(f0 / 440.0)))
        if 24 <= pitch <= 64:
            voiced.append(((s + frame_len / 2) / sr, pitch, min(1.0, r / loud_ref)))

    notes: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None
    for t_sec, pitch, amp in voiced:
        if cur is not None and pitch == cur["pitch"] and (t_sec - cur["end"]) <= 0.045:
            cur["end"] = t_sec + 0.025
            cur["amps"].append(amp)
            continue
        if cur is not None:
            notes.append(cur)
        cur = {"start": t_sec - 0.025, "end": t_sec + 0.025, "pitch": pitch, "amps": [amp]}
    if cur is not None:
        notes.append(cur)

    out: List[Dict[str, Any]] = []
    for n in notes:
        dur = n["end"] - n["start"]
        vel = 0.30 + 0.65 * float(np.mean(n["amps"]))
        if dur < 0.06:  # cleaner gate: drop blips shorter than 60 ms
            continue
        out.append({"start": max(0.0, n["start"]), "dur": dur, "pitch": n["pitch"], "vel": min(1.0, vel), "role": "bass"})
    return out


def generate_bass_midi(
    track_name: str,
    bass_wav: Path,
    bpm: float,
    output_mid: Path,
    ppq: int = MIDI_PPQ,
) -> bool:
    """Write clean (un-humanized) bass MIDI transcribed from the prepped bass stem."""
    try:
        notes = transcribe_bass_notes(bass_wav)
        write_smf_midi(output_mid, [notes_to_midi_track(f"{track_name} Bass", notes, bpm, channel=0, ppq=ppq)], ppq=ppq)
        log.info("[%s] Generated Bass MIDI: %s (%d notes)", track_name, output_mid.name, len(notes))
        return True
    except Exception as exc:
        log.warning("[%s] Bass MIDI transcription failed: %s", track_name, exc)
        return False


# --------------------------------------------------------------------------
# Built-in loudness meter (ITU-R BS.1770-4 / EBU R128)
# --------------------------------------------------------------------------

def _k_weighting_sos(sr: int) -> np.ndarray:
    """K-weighting pre-filter (high shelf + RLB high-pass) for any sample rate.

    Bilinear-transform form that reproduces the ITU-R BS.1770 48 kHz
    coefficients exactly and adapts them to other sample rates.
    """
    # Stage 1: high shelf
    G, Q, fc = 3.999843853973347, 0.7071752369554196, 1681.974450955533
    K = math.tan(math.pi * fc / sr)
    Vh = 10 ** (G / 20.0)
    Vb = Vh ** 0.4996667741545416
    a0 = 1.0 + K / Q + K * K
    shelf = [(Vh + Vb * K / Q + K * K) / a0, 2.0 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0,
             1.0, 2.0 * (K * K - 1.0) / a0, (1.0 - K / Q + K * K) / a0]
    # Stage 2: RLB high-pass
    Q, fc = 0.5003270373253953, 38.13547087602444
    K = math.tan(math.pi * fc / sr)
    a0 = 1.0 + K / Q + K * K
    hp = [1.0, -2.0, 1.0, 1.0, 2.0 * (K * K - 1.0) / a0, (1.0 - K / Q + K * K) / a0]
    return np.array([shelf, hp])


def measure_loudness(audio: np.ndarray, sr: int) -> Dict[str, Optional[float]]:
    """Integrated loudness (LUFS), loudness range (LU) and true peak (dBTP).

    audio: (frames, channels) float array. Returns None for a value that
    cannot be measured (e.g. a file shorter than one 400 ms block).
    """
    if audio.ndim == 1:
        audio = audio[:, None]
    audio = audio.astype(np.float64)
    weighted = scipy.signal.sosfilt(_k_weighting_sos(sr), audio, axis=0)
    power = weighted ** 2

    def block_loudness(block_sec: float, hop_sec: float) -> np.ndarray:
        blk, hop = int(sr * block_sec), int(sr * hop_sec)
        if power.shape[0] < blk:
            return np.zeros(0)
        csum = np.vstack([np.zeros((1, power.shape[1])), np.cumsum(power, axis=0)])
        starts = np.arange(0, power.shape[0] - blk + 1, hop)
        ms = (csum[starts + blk] - csum[starts]) / blk  # mean square per channel
        return ms.sum(axis=1)  # channel weights are 1.0 for L/R (no surround)

    def to_lufs(z: np.ndarray) -> np.ndarray:
        return -0.691 + 10 * np.log10(np.maximum(z, 1e-20))

    result: Dict[str, Optional[float]] = {"lufs": None, "lra": None, "true_peak": None}

    z = block_loudness(0.4, 0.1)
    if z.size:
        gated = z[to_lufs(z) > -70.0]
        if gated.size:
            rel_gate = to_lufs(np.array([gated.mean()]))[0] - 10.0
            final = gated[to_lufs(gated) > rel_gate]
            if final.size:
                result["lufs"] = round(float(to_lufs(np.array([final.mean()]))[0]), 2)

    zs = block_loudness(3.0, 0.1)
    if zs.size:
        ls = to_lufs(zs)
        ls = ls[ls > -70.0]
        if ls.size:
            rel = to_lufs(np.array([np.mean(10 ** ((ls + 0.691) / 10))]))[0] - 20.0
            ls = ls[ls > rel]
            if ls.size:
                result["lra"] = round(float(np.percentile(ls, 95) - np.percentile(ls, 10)), 2)

    # True peak: 4x oversampled peak (BS.1770 Annex 2)
    try:
        over = scipy.signal.resample_poly(audio, 4, 1, axis=0) if sr < 96000 else audio
        tp = float(np.max(np.abs(over))) if over.size else 0.0
        result["true_peak"] = round(20 * math.log10(max(tp, 1e-9)), 2)
    except Exception:
        pass
    return result


# --------------------------------------------------------------------------
# Stage 6: Automated Mix QA Analyzer
# --------------------------------------------------------------------------

# Loudness targets used everywhere (report, fix list, UI) so they can't disagree.
QA_TARGET_LUFS_LOW = -14.0    # streaming normalisation reference
QA_TARGET_LUFS_HIGH = -9.0    # loud modern pre-master
QA_TRUE_PEAK_CEILING = -1.0
QA_CREST_RANGE = (8.0, 16.0)
QA_LRA_RANGE = (4.0, 12.0)
QA_LUFS_TOLERANCE = 0.5       # meters differ by a few tenths; don't flag -14.3 against -14.0


class MixQAReport:
    """Measures loudness, dynamics, spectral balance and stereo image of a render.

    Every number in the report is measured from the file. Loudness comes
    from ffmpeg's ebur128 filter when available, otherwise from the built-in
    BS.1770 meter; if neither works the value is reported as unavailable,
    never guessed.
    """

    def __init__(self, wav_path: Path, ffmpeg_bin: str = "ffmpeg") -> None:
        self.wav_path = wav_path
        self.ffmpeg_bin = ffmpeg_bin

    def run_ebur128(self) -> Optional[Dict[str, float]]:
        """ffmpeg ebur128 measurement, or None if ffmpeg is missing / output unparseable."""
        cmd = [self.ffmpeg_bin, "-nostats", "-i", str(self.wav_path),
               "-filter_complex", "ebur128=peak=true", "-f", "null", "-"]
        try:
            res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
                                 text=True, errors="replace", check=False, timeout=600)
        except (OSError, subprocess.SubprocessError) as exc:
            log.info("ffmpeg ebur128 unavailable for %s (%s); using built-in meter", self.wav_path.name, exc)
            return None
        out = res.stderr or ""
        summary = out[out.rfind("Summary:"):] if "Summary:" in out else ""
        i_m = re.search(r"I:\s+([-\d\.]+)\s+LUFS", summary)
        lra_m = re.search(r"LRA:\s+([-\d\.]+)\s+LU", summary)
        tp_m = re.search(r"Peak:\s+([-\d\.]+)\s+dBFS", summary)
        if res.returncode != 0 or not (i_m and lra_m and tp_m):
            return None
        return {"lufs": float(i_m.group(1)), "lra": float(lra_m.group(1)), "true_peak": float(tp_m.group(1))}

    def analyze(self) -> Dict[str, Any]:
        """Return all measurements as a dict (None = not measurable)."""
        info = sf.info(str(self.wav_path))
        sr = info.samplerate
        audio, _ = sf.read(str(self.wav_path), always_2d=True, dtype="float32")

        loud = self.run_ebur128()
        method = "ffmpeg ebur128"
        if loud is None:
            method = "built-in BS.1770 meter"
            loud = measure_loudness(audio, sr)

        peak_amp = float(np.max(np.abs(audio))) if audio.size else 0.0
        rms_amp = float(np.sqrt(np.mean(np.square(audio, dtype=np.float64)))) if audio.size else 0.0
        peak_db = 20.0 * math.log10(max(1e-9, peak_amp))
        rms_db = 20.0 * math.log10(max(1e-9, rms_amp))

        # Spectral balance per 5 s window (fraction of total power in each band)
        mono = np.mean(audio, axis=1)
        win = int(5.0 * sr)
        bands = {"harsh": (8000, 16000), "sibilance": (5500, 10000), "sub": (20, 120), "mud": (150, 400)}
        scores: Dict[str, List[Tuple[float, float]]] = {k: [] for k in bands}
        for start in range(0, max(1, len(mono) - 1024), win):
            chunk = mono[start:start + win]
            if len(chunk) < 1024 or float(np.max(np.abs(chunk))) < 1e-4:
                continue  # skip silence: it would rank as the "hot spot" for nothing
            freqs, psd = scipy.signal.welch(chunk, fs=sr, nperseg=min(4096, len(chunk)))
            tot = float(np.sum(psd)) + 1e-12
            for k, (lo, hi) in bands.items():
                m = (freqs >= lo) & (freqs <= hi)
                scores[k].append((start / sr, float(np.sum(psd[m]) / tot)))
        peaks = {k: (max(v, key=lambda x: x[1]) if v else None) for k, v in scores.items()}
        means = {k: (float(np.mean([x[1] for x in v])) if v else None) for k, v in scores.items()}

        # Stereo image: L/R correlation and side-to-mid energy
        correlation: Optional[float] = None
        side_ratio_db: Optional[float] = None
        if audio.shape[1] >= 2:
            left, right = audio[:, 0].astype(np.float64), audio[:, 1].astype(np.float64)
            denom = math.sqrt(float(np.sum(left ** 2)) * float(np.sum(right ** 2)))
            if denom > 0:
                correlation = float(np.sum(left * right) / denom)
                mid_e = float(np.sum(((left + right) / 2) ** 2))
                side_e = float(np.sum(((left - right) / 2) ** 2))
                side_ratio_db = 10 * math.log10(max(side_e, 1e-12) / max(mid_e, 1e-12))

        return {
            "sr": sr, "channels": info.channels, "duration": info.duration, "loudness_method": method,
            "lufs": loud.get("lufs"), "lra": loud.get("lra"), "true_peak": loud.get("true_peak"),
            "peak_db": peak_db, "rms_db": rms_db, "crest": peak_db - rms_db,
            "band_peaks": peaks, "band_means": means,
            "correlation": correlation, "side_ratio_db": side_ratio_db,
        }

    def generate_report(self) -> str:
        """Run the analysis and render it as a Markdown report."""
        m = self.analyze()

        def fmt_time(sec: float) -> str:
            return f"{int(sec // 60):02d}:{int(sec % 60):02d}"

        def fmt(v: Optional[float], unit: str, nd: int = 1) -> str:
            return f"{v:.{nd}f} {unit}" if v is not None else "unavailable"

        def in_range(v: Optional[float], lo: float, hi: float, ok: str = "[OK]", bad: str = "[ATTENTION]") -> str:
            if v is None:
                return "[NOT MEASURED]"
            return ok if lo <= v <= hi else bad

        lufs, tp, lra = m["lufs"], m["true_peak"], m["lra"]
        bp = m["band_peaks"]
        harsh, sib, mud, sub = bp["harsh"], bp["sibilance"], bp["mud"], bp["sub"]
        harsh_hot = bool(harsh and harsh[1] > 0.08)
        sib_hot = bool(sib and sib[1] > 0.12)
        mud_hot = bool(mud and mud[1] > 0.22)
        sub_mean = m["band_means"]["sub"]
        sub_heavy = bool(sub_mean is not None and sub_mean > 0.55)
        corr = m["correlation"]

        fixes: List[str] = []
        if tp is not None and tp > QA_TRUE_PEAK_CEILING:
            fixes.append(f"00:00 – Master Output – True peak {tp:.1f} dBTP is above the {QA_TRUE_PEAK_CEILING:.0f} dBTP streaming ceiling – "
                         f"Fruity Limiter: ceiling {QA_TRUE_PEAK_CEILING:.1f} dB, enable lookahead, re-export")
        if lufs is not None and lufs < QA_TARGET_LUFS_LOW - QA_LUFS_TOLERANCE:
            fixes.append(f"00:00 – Master Bus – Integrated loudness {lufs:.1f} LUFS is below the {QA_TARGET_LUFS_LOW:.0f} LUFS target – "
                         f"Maximus / Fruity Limiter: raise input gain about {QA_TARGET_LUFS_LOW - lufs:.1f} dB into the limiter")
        elif lufs is not None and lufs > QA_TARGET_LUFS_HIGH + QA_LUFS_TOLERANCE:
            fixes.append(f"00:00 – Master Bus – Integrated loudness {lufs:.1f} LUFS is above {QA_TARGET_LUFS_HIGH:.0f} LUFS (likely over-limited) – "
                         f"Maximus: back off input gain about {lufs - QA_TARGET_LUFS_HIGH:.1f} dB to recover transients")
        if harsh_hot:
            fixes.append(f"{fmt_time(harsh[0])} – Cymbals / Air – High-frequency fizz ({harsh[1]*100:.0f}% of energy in 8–16 kHz) – "
                         f"Fruity Parametric EQ 2: -2.5 dB bell at 11,500 Hz (Q 3.8) on the drum or instrument bus")
        if sib_hot:
            fixes.append(f"{fmt_time(sib[0])} – Vocals – Sibilance build-up ({sib[1]*100:.0f}% of energy in 5.5–10 kHz) – "
                         f"Maximus: de-ess band around 6,800 Hz on the vocal insert, threshold about -18 dB")
        if mud_hot:
            fixes.append(f"{fmt_time(mud[0])} – Bass / Synths – Low-mid build-up ({mud[1]*100:.0f}% of energy in 150–400 Hz) – "
                         f"Fruity Parametric EQ 2: -2.8 dB dip at 260 Hz (Q 2.2) on the instrument bus")
        if sub_heavy:
            fixes.append(f"00:00 – Low End – Sub band holds {sub_mean*100:.0f}% of the energy on average – "
                         f"Fruity Parametric EQ 2: tighten the bass with a 30 Hz low-cut and check kick/bass overlap")
        if corr is not None and corr < 0.2:
            fixes.append(f"00:00 – Stereo Image – Low L/R correlation ({corr:+.2f}); risk of mono cancellation – "
                         f"Fruity Stereo Shaper: narrow wide elements and keep bass/kick centred")
        if not fixes:
            fixes.append("00:00 – Mix – No measured issue crossed a threshold – No action needed; trust your ears for the final call")

        def band_line(entry: Optional[Tuple[float, float]], hot: bool, ok: str, bad: str, label: str) -> str:
            if entry is None:
                return "- **Status**: Not measured (no non-silent audio)"
            return (f"- **Status**: {bad if hot else ok}\n"
                    f"- Highest {label} at **{fmt_time(entry[0])}** ({entry[1]*100:.1f}% of window energy).")

        stereo_status = "Not measured (mono file)" if corr is None else (
            "Mono-compatibility risk" if corr < 0.2 else ("Very narrow / near mono" if corr > 0.97 else "Healthy width"))

        md = f"""# Mix QA Analysis Report: {self.wav_path.stem}

**Source File**: `{self.wav_path.name}`  
**Analyzed At**: `{time.strftime('%Y-%m-%d %H:%M:%S')}`  
**Sample Rate**: `{m['sr']} Hz` | **Channels**: `{m['channels']}` | **Duration**: `{m['duration']:.2f} s`  
**Loudness Measured With**: `{m['loudness_method']}`  

---

## 1. Loudness & Dynamic Range Overview

| Metric | Measured Value | Standard Target | Status |
| :--- | :--- | :--- | :--- |
| **Integrated Loudness** | **{fmt(lufs, 'LUFS')}** | {QA_TARGET_LUFS_LOW:.1f} to {QA_TARGET_LUFS_HIGH:.1f} LUFS | {in_range(lufs, QA_TARGET_LUFS_LOW - QA_LUFS_TOLERANCE, QA_TARGET_LUFS_HIGH + QA_LUFS_TOLERANCE)} |
| **True Peak** | **{fmt(tp, 'dBTP')}** | <= {QA_TRUE_PEAK_CEILING:.1f} dBTP | {in_range(tp, -200.0, QA_TRUE_PEAK_CEILING, bad='[PEAK WARNING]')} |
| **Crest Factor** | **{m['crest']:.1f} dB** | {QA_CREST_RANGE[0]:.1f} to {QA_CREST_RANGE[1]:.1f} dB | {in_range(m['crest'], *QA_CREST_RANGE, bad='[CHECK COMPRESSION]')} |
| **Loudness Range (LRA)** | **{fmt(lra, 'LU')}** | {QA_LRA_RANGE[0]:.1f} to {QA_LRA_RANGE[1]:.1f} LU | {in_range(lra, *QA_LRA_RANGE)} |
| **Peak Amplitude** | **{m['peak_db']:.2f} dBFS** | < 0.0 dBFS | {'[OK]' if m['peak_db'] < -0.1 else '[CLIPPING]'} |
| **RMS Level** | **{m['rms_db']:.2f} dBFS** | -18.0 to -8.0 dBFS | {in_range(m['rms_db'], -18.0, -8.0)} |

---

## 2. Five-Band Frequency & Stereo Assessment

### Band 1: Harshness / Fizz (8–16 kHz)
{band_line(harsh, harsh_hot, 'Controlled', 'Elevated High-End Fizz', 'fizz')}

### Band 2: Sibilance (5.5–10 kHz)
{band_line(sib, sib_hot, 'Transparent', 'Sibilance Accentuation', 'sibilance')}

### Band 3: Low-Mid Mud (150–400 Hz)
{band_line(mud, mud_hot, 'Balanced', 'Low-Mid Masking Present', 'low-mid build-up')}

### Band 4: Sub (20–120 Hz)
{band_line(sub, sub_heavy, 'Balanced', 'Sub-Heavy', 'sub energy')}
- Average sub share: {f"{sub_mean*100:.1f}%" if sub_mean is not None else 'unavailable'}.

### Band 5: Stereo Image & Mono Compatibility
- **Status**: {stereo_status}
- L/R correlation: {f"{corr:+.2f}" if corr is not None else 'unavailable'}; side-to-mid energy: {f"{m['side_ratio_db']:.1f} dB" if m['side_ratio_db'] is not None else 'unavailable'}.

---

## 3. Recommended Actionable Fix List

{chr(10).join(f"- {item}" for item in fixes)}
"""
        return md


# --------------------------------------------------------------------------
# Pipeline Stages Implementation
# --------------------------------------------------------------------------

INBOX_STEM_PATTERN = re.compile(r"^(.+)_(vocals|drums|bass|instruments|other|keys)$", re.IGNORECASE)


def demucs_command() -> List[str]:
    """Python launcher used to run Demucs.

    DEMUCS_PYTHON overrides it (e.g. "py -3.10" or a venv's python.exe).
    Default: the Windows "py -3.10" launcher when present (the original
    setup), otherwise the interpreter running this script.
    """
    env = os.environ.get("DEMUCS_PYTHON", "").strip()
    if env:
        return shlex.split(env, posix=(os.name != "nt"))
    if os.name == "nt" and shutil.which("py"):
        return ["py", "-3.10"]
    return [sys.executable]


def inbox_groups(paths: PipelinePaths) -> Tuple[Dict[str, List[Path]], List[Path]]:
    """Split inbox WAVs into grouped stem sets {track: [wavs]} and solitary full mixes."""
    groups: Dict[str, List[Path]] = {}
    solitary: List[Path] = []
    for wav in visible_wavs(paths.inbox):
        match = INBOX_STEM_PATTERN.match(wav.stem)
        if match:
            track = match.group(1).strip()
            if track and track not in (".", ".."):
                groups.setdefault(track, []).append(wav)
        else:
            solitary.append(wav)
    return groups, solitary


def invalidate_track_outputs(paths: PipelinePaths, track: str, renders: bool = True) -> None:
    """Remove done-markers (and optionally generated mixes + reports) so a track rebuilds cleanly."""
    prep = paths.prepped / track
    (prep / ".done").unlink(missing_ok=True)
    (prep / "MIDI" / ".midi_done").unlink(missing_ok=True)
    if renders:
        for suffix in ("_RoughMix", "_Humanized"):
            wav = paths.renders / f"{track}{suffix}.wav"
            wav.unlink(missing_ok=True)
            qa_report_path(wav).unlink(missing_ok=True)
    failures(paths).clear(track=track)
    for suffix in ("_RoughMix", "_Humanized"):
        failures(paths).clear(track=f"{track}{suffix}")


def routed_stem_changed(source: Path, destination: Path) -> bool:
    if not destination.exists():
        return True
    src, dst = source.stat(), destination.stat()
    # copy2 preserves source timestamps. A newer destination may be a manual import.
    return src.st_mtime_ns > dst.st_mtime_ns or (src.st_mtime_ns == dst.st_mtime_ns and src.st_size != dst.st_size)


def pending_inbox(paths: PipelinePaths) -> List[str]:
    """Track names in 01_Suno_Inbox that still need routing or Demucs separation."""
    reg = failures(paths)
    pending: List[str] = []
    groups, solitary = inbox_groups(paths)
    for track, files in groups.items():
        for src in files:
            dest = paths.stems / track / src.name
            if routed_stem_changed(src, dest):
                pending.append(track)
                break
    for mix in solitary:
        if visible_wavs(paths.stems / mix.stem):
            continue
        if reg.is_blocked("demucs", mix.stem, fingerprint([mix])):
            continue
        pending.append(mix.stem)
    return pending


def process_inbox(paths: PipelinePaths) -> int:
    """Stage 1 -> 2: Inbox Auto-Router & Stem Splitter.

    Scans 01_Suno_Inbox for WAV files. NEVER modifies or deletes files in 01_Suno_Inbox.
    - Grouped stem files (<Track>_vocals.wav ...) are copied to 02_Moises_Stems/<Track>/.
    - A full mix with no stems folder is separated with Demucs (see demucs_command()).
      A failed separation is recorded and not retried until the file changes.
    """
    groups, solitary = inbox_groups(paths)
    reg = failures(paths)
    processed_count = 0

    for track_name, files in groups.items():
        if not all(wait_file_ready(f) for f in files):
            continue
        dest_dir = paths.stems / track_name
        dest_dir.mkdir(parents=True, exist_ok=True)
        changed = [src for src in files if routed_stem_changed(src, dest_dir / src.name)]
        if not changed:
            continue
        with tempfile.TemporaryDirectory(dir=dest_dir) as staging:
            for src in changed:
                shutil.copy2(src, Path(staging) / src.name)
            for src in changed:
                os.replace(Path(staging) / src.name, dest_dir / src.name)
                processed_count += 1
            invalidate_track_outputs(paths, track_name)
            log.info("[%s] Routed %d inbox stems", track_name, len(changed))

    for mix_wav in solitary:
        track_name = mix_wav.stem
        dest_dir = paths.stems / track_name
        if visible_wavs(dest_dir):
            continue
        sig = fingerprint([mix_wav])
        if reg.is_blocked("demucs", track_name, sig):
            continue
        if not wait_file_ready(mix_wav):
            continue

        log.info("[%s] Full mix detected in 01_Suno_Inbox; running Demucs separation...", track_name)
        temp_demucs_out = paths.automation / f"demucs_tmp_{int(time.time())}"
        demucs_cmd = demucs_command() + ["-m", "demucs", "-n", "htdemucs", "-o", str(temp_demucs_out), str(mix_wav)]
        try:
            res = subprocess.run(demucs_cmd, capture_output=True, text=True, check=False)
            out_folder = temp_demucs_out / "htdemucs" / mix_wav.stem
            if res.returncode == 0 and out_folder.exists() and visible_wavs(out_folder):
                dest_dir.mkdir(parents=True, exist_ok=True)
                for st_wav in visible_wavs(out_folder):
                    shutil.copy2(st_wav, dest_dir / f"{track_name}_{st_wav.name}")
                log.info("[%s] Demucs 4-stem separation complete -> %s", track_name, dest_dir)
                reg.clear("demucs", track_name)
                processed_count += 1
            else:
                reg.record("demucs", track_name, sig,
                           f"Demucs exit {res.returncode} ({' '.join(demucs_cmd[:3])}). Set DEMUCS_PYTHON or export "
                           f"stems via Moises into {dest_dir}.\n{(res.stderr or '').strip()[-1500:]}")
        except Exception as exc:
            reg.record("demucs", track_name, sig, f"Could not invoke Demucs: {exc}")
        finally:
            shutil.rmtree(temp_demucs_out, ignore_errors=True)

    return processed_count


def pending_stem_tracks(paths: PipelinePaths) -> List[Path]:
    """Track folders in 02_Moises_Stems with WAVs, no .done marker, and no unresolved failure."""
    reg = failures(paths)
    pending: List[Path] = []
    for d in visible_dirs(paths.stems):
        wavs = visible_wavs(d)
        if not wavs or (paths.prepped / d.name / ".done").exists():
            continue
        if reg.is_blocked("stem_prep", d.name, fingerprint(wavs)):
            continue
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
    Tracks that still lack a .done marker afterwards are recorded as failed.
    """
    pending = pending_stem_tracks(paths)
    if not pending and not force:
        return 0

    reg = failures(paths)

    def fail_all(msg: str) -> None:
        for d in pending:
            if not (paths.prepped / d.name / ".done").exists():
                reg.record("stem_prep", d.name, fingerprint(visible_wavs(d)), msg)

    if not stem_prep_path.is_file():
        fail_all(f"stem_prep.py not found at {stem_prep_path} (set STEM_PREP_SCRIPT)")
        return 0

    log.info("Pending tracks for stem_prep: [%s]", ", ".join(d.name for d in pending) or "forced run")
    cmd = [sys.executable, str(stem_prep_path), "--base-dir", str(paths.base), "--once", "--preset", preset]
    log.info("Running stem_prep: %s", " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if res.returncode != 0:
        fail_all(f"stem_prep exit code {res.returncode}:\n{(res.stderr or res.stdout or '').strip()[-1500:]}")
        return 0

    log.info("stem_prep completed:\n%s", res.stdout.strip())
    fail_all("stem_prep finished but wrote no .done marker for this track:\n" + (res.stdout or "").strip()[-1500:])
    for d in pending:
        if (paths.prepped / d.name / ".done").exists():
            reg.clear("stem_prep", d.name)
    return len(pending) if pending else 1


def midi_inputs(track_dir: Path) -> List[Path]:
    return visible_wavs(track_dir / "Audio_Stems") + visible_wavs(track_dir / "Drum_Triggers")


def pending_midi_tracks(paths: PipelinePaths) -> List[Path]:
    """Prepped track folders with .done but no MIDI/.midi_done or metadata (and no unresolved failure)."""
    reg = failures(paths)
    pending: List[Path] = []
    for d in visible_dirs(paths.prepped):
        if not (d / ".done").exists():
            continue
        if (d / "MIDI" / ".midi_done").exists() and (d / "track_metadata.json").exists():
            continue
        if reg.is_blocked("midi", d.name, fingerprint(midi_inputs(d))):
            continue
        pending.append(d)
    return pending


def _midi_for_track(paths: PipelinePaths, track_dir: Path, preset: str) -> None:
    track_name = track_dir.name
    midi_dir = track_dir / "MIDI"
    midi_dir.mkdir(parents=True, exist_ok=True)
    audio_stems_dir = track_dir / "Audio_Stems"
    drum_triggers_dir = track_dir / "Drum_Triggers"

    log.info("[%s] Starting BPM/Key detection and MIDI generation...", track_name)
    stems = visible_wavs(audio_stems_dir)
    drum_prep = [p for p in stems if stem_kind(p, track_name) == "drums"]
    bass_prep = [p for p in stems if stem_kind(p, track_name) == "bass"]
    kick_trig = sorted(drum_triggers_dir.glob("*Kick_Trigger.wav"))

    bpm_ref = drum_prep[0] if drum_prep else (kick_trig[0] if kick_trig else (bass_prep[0] if bass_prep else None))
    bpm = estimate_bpm_from_audio(bpm_ref) if bpm_ref else 120.0
    log.info("[%s] Estimated BPM: %.1f", track_name, bpm)

    inst_prep = [p for p in stems if stem_kind(p, track_name) == "instruments"]
    key_ref = inst_prep[0] if inst_prep else (bass_prep[0] if bass_prep else bpm_ref)
    key_name, scale_notes = estimate_key_from_audio(key_ref) if key_ref else ("C Major", ["C", "D", "E", "F", "G", "A", "B"])
    log.info("[%s] Estimated Key: %s (Scale: %s)", track_name, key_name, ", ".join(scale_notes))

    downbeat = 0.0
    drums_mid = midi_dir / f"{track_name}_FPC_Drums.mid"
    notes = []
    if drum_triggers_dir.exists():
        notes, downbeat, bpm = transcribe_drum_hits(track_name, drum_triggers_dir, bpm)
        log.info("[%s] Tempo fitted to drum hits: %.2f BPM, downbeat at %.3f s", track_name, bpm, downbeat)
        if notes:
            write_smf_midi(drums_mid, [notes_to_midi_track(f"{track_name} FPC Drums", notes, bpm, channel=9)])
            log.info("[%s] Generated FPC Drum MIDI: %s (%d hits)", track_name, drums_mid.name, len(notes))
        else:
            log.warning("[%s] No drum trigger transients detected in %s", track_name, drum_triggers_dir)

    if not notes and drums_mid.exists():
        drums_mid.rename(drums_mid.with_suffix(f".{time.time_ns()}.bak"))
    bass_mid = midi_dir / f"{track_name}_Bass.mid"
    if bass_prep:
        if not generate_bass_midi(track_name, bass_prep[0], bpm, bass_mid):
            raise RuntimeError(f"Bass MIDI transcription failed for {track_name}")
    elif bass_mid.exists():
        bass_mid.rename(bass_mid.with_suffix(f".{time.time_ns()}.bak"))

    fl_proj_path = paths.fl_project / track_name / f"{track_name}.flp"
    metadata: Dict[str, Any] = {
        "track": track_name,
        "estimated_bpm": bpm,
        "estimated_key": key_name,
        "scale_notes": scale_notes,
        "downbeat_sec": round(downbeat, 4),
        "preset": preset,
        "prepped_stems": [p.name for p in visible_wavs(audio_stems_dir)],
        "drum_triggers": [p.name for p in visible_wavs(drum_triggers_dir)],
        "midi_files": [p.name for p in sorted(midi_dir.glob("*.mid"))],
        "fl_project_path": str(fl_proj_path) if fl_proj_path.exists() else None,
        "processed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    atomic_write_text(track_dir / "track_metadata.json", json.dumps(metadata, indent=2))
    atomic_write_text(midi_dir / ".midi_done", f"MIDI generated at {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    log.info("[%s] Metadata & MIDI done written", track_name)


def generate_midi_and_metadata(
    paths: PipelinePaths,
    preset: str = DEFAULT_PRESET,
) -> int:
    """Stage 3 & 4: BPM/Key/downbeat detection, clean FPC drum MIDI, bass MIDI and metadata."""
    reg = failures(paths)
    processed = 0
    for track_dir in pending_midi_tracks(paths):
        try:
            _midi_for_track(paths, track_dir, preset)
            reg.clear("midi", track_dir.name)
            processed += 1
        except Exception as exc:
            log.debug("MIDI stage traceback", exc_info=True)
            reg.record("midi", track_dir.name, fingerprint(midi_inputs(track_dir)), f"{type(exc).__name__}: {exc}")
    return processed


def pending_mix_renders(paths: PipelinePaths) -> List[Path]:
    """Render WAVs in 05_Mix_Renders without a QA report (and no unresolved failure)."""
    reg = failures(paths)
    return [
        w for w in visible_wavs(paths.renders)
        if not qa_report_path(w).exists() and not reg.is_blocked("mix_qa", w.stem, fingerprint([w]))
    ]


def write_qa_report(render_wav: Path, ffmpeg_bin: str = "ffmpeg") -> Path:
    report = qa_report_path(render_wav)
    atomic_write_text(report, MixQAReport(render_wav, ffmpeg_bin=ffmpeg_bin).generate_report())
    log.info("Mix QA report written -> %s", report)
    return report


def process_mix_renders(paths: PipelinePaths, ffmpeg_bin: str = "ffmpeg") -> int:
    """Stage 6: Automated Mix QA Analyzer for every render lacking a report."""
    reg = failures(paths)
    analyzed = 0
    for wav in pending_mix_renders(paths):
        if not wait_file_ready(wav):
            continue
        log.info("Analyzing mix render: %s...", wav.name)
        try:
            write_qa_report(wav, ffmpeg_bin=ffmpeg_bin)
            reg.clear("mix_qa", wav.stem)
            analyzed += 1
        except Exception as exc:
            reg.record("mix_qa", wav.stem, fingerprint([wav]), f"{type(exc).__name__}: {exc}")
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
        humanize: bool = True,
    ) -> None:
        self.paths = PipelinePaths(base_dir)
        self.humanize = humanize
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

        # Rough mix + Humanized Mix (drums & bass re-performed from MIDI)
        import humanized_mix  # local import: humanized_mix imports this module
        mix_count = humanized_mix.run_mix_stages(self.paths, ffmpeg_bin=self.ffmpeg_bin, humanize=self.humanize)
        if mix_count:
            log.info("Mix stage: %d mix(es) rendered", mix_count)

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
                    import humanized_mix  # local import: humanized_mix imports this module
                    humanized_mix.run_mix_stages(self.paths, ffmpeg_bin=self.ffmpeg_bin, humanize=self.humanize)
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
        "--no-humanize",
        action="store_true",
        help="Skip rendering the Humanized Mix (drums & bass re-performed from MIDI)",
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
        humanize=not args.no_humanize,
    )

    if args.watch:
        automator.watch()
    else:
        automator.run_all_stages_once()

    return 0


if __name__ == "__main__":
    sys.exit(main())
