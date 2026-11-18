#!/usr/bin/env python3
"""Humanized Mix: re-perform drums & bass from MIDI and mix them with the stems.

Pipeline for one track (all local, numpy/scipy only):

1. Read the clean transcribed MIDI (``MIDI/<Track>_FPC_Drums.mid`` and
   ``MIDI/<Track>_Bass.mid``). If you edit these in FL Studio and save them
   back, the next render follows your edit.
2. Humanize the performance with a model of how players actually deviate
   from the grid:
   - a slow, shared "band drift" (the whole band breathes together),
   - smaller per-instrument drift (correlated, not white noise),
   - per-hit micro-jitter, snare/bass lay-back on the backbeat,
     hats pushed slightly ahead, optional 16th swing,
   - beat-position velocity accents and no machine-gun repeats.
   The humanized performance is saved as ``*_Humanized.mid`` for FL Studio.
3. Re-play it:
   - drums are re-triggered from one-shot samples cut from the song's OWN
     prepped drum stem (isolated hits found via the drum triggers, several
     round-robin samples per drum); synthesized hits only as a fallback,
   - bass is played by a small additive bass synth.
   Each re-performed part is level-matched to the original stem.
4. Mix with the vocal / instrument stems (replace, layer or keep original
   drums and bass), normalize to a loudness target with a true-peak-safe
   limiter, and write ``05_Mix_Renders/<Track>_Humanized.wav`` plus a Mix QA
   report. The re-performed drum/bass stems are also written to
   ``03_Prepped_Stems/<Track>/Humanized_Stems/`` for import into FL Studio.

The model is statistical (seeded, repeatable); each seed is a different
"take" of the same performance.
"""

from __future__ import annotations

import bisect
from dataclasses import asdict, dataclass, field, fields
import json
import math
import os
from pathlib import Path
import struct
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple
import zlib

import numpy as np
import scipy.ndimage
import scipy.signal
import soundfile as sf

import pipeline_automator as pa

log = pa.log

DRUM_MODES = ("replace", "layer", "original")
BASS_MODES = ("replace", "layer", "original")
SETTINGS_FILE = "humanize_settings.json"
HUMANIZED_STEMS_DIR = "Humanized_Stems"


# --------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------

@dataclass
class HumanizeSettings:
    humanize: float = 0.5          # 0 = quantized machine, 1 = loose live player
    swing: float = 0.0             # 0..1 of a full 16th-note triplet swing
    drums_mode: str = "replace"    # replace | layer | original
    drums_blend: float = 0.5       # layer mode: share of re-performed drums
    keep_cymbals: float = 0.0      # replace mode: original drum stem above 7 kHz (crashes/rides/air)
    bass_mode: str = "replace"     # replace | layer | original
    bass_blend: float = 0.4        # layer mode: share of synth bass
    vocals_db: float = 0.0
    instruments_db: float = 0.0
    drums_db: float = 0.0
    bass_db: float = 0.0
    target_lufs: float = -14.0
    ceiling_dbtp: float = -1.0
    seed: Optional[int] = None     # None -> stable per track name; change it for a new "take"
    extras: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> "HumanizeSettings":
        s = cls()
        if not data:
            return s
        for f in fields(cls):
            if f.name in data and data[f.name] is not None and f.name != "extras":
                setattr(s, f.name, data[f.name])
        return s.validated()

    def validated(self) -> "HumanizeSettings":
        def clamp(v: Any, lo: float, hi: float, default: float) -> float:
            try:
                return float(min(hi, max(lo, float(v))))
            except (TypeError, ValueError):
                return default

        d = HumanizeSettings()
        self.humanize = clamp(self.humanize, 0.0, 1.0, d.humanize)
        self.swing = clamp(self.swing, 0.0, 1.0, d.swing)
        self.drums_blend = clamp(self.drums_blend, 0.0, 1.0, d.drums_blend)
        self.keep_cymbals = clamp(self.keep_cymbals, 0.0, 1.0, d.keep_cymbals)
        self.bass_blend = clamp(self.bass_blend, 0.0, 1.0, d.bass_blend)
        for name in ("vocals_db", "instruments_db", "drums_db", "bass_db"):
            setattr(self, name, clamp(getattr(self, name), -24.0, 12.0, 0.0))
        self.target_lufs = clamp(self.target_lufs, -24.0, -6.0, d.target_lufs)
        self.ceiling_dbtp = clamp(self.ceiling_dbtp, -6.0, -0.1, d.ceiling_dbtp)
        if self.drums_mode not in DRUM_MODES:
            self.drums_mode = d.drums_mode
        if self.bass_mode not in BASS_MODES:
            self.bass_mode = d.bass_mode
        if self.seed is not None:
            try:
                self.seed = int(self.seed) & 0x7FFFFFFF
            except (TypeError, ValueError):
                self.seed = None
        return self

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d.pop("extras", None)
        return d


def load_settings(track_dir: Path) -> HumanizeSettings:
    try:
        return HumanizeSettings.from_dict(json.loads((track_dir / SETTINGS_FILE).read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return HumanizeSettings()


def track_seed(track_name: str, settings: HumanizeSettings) -> int:
    return settings.seed if settings.seed is not None else zlib.crc32(track_name.encode("utf-8")) & 0x7FFFFFFF


# --------------------------------------------------------------------------
# Minimal Standard MIDI File reader
# --------------------------------------------------------------------------

def _read_vlq(data: bytes, pos: int) -> Tuple[int, int]:
    val = 0
    while True:
        b = data[pos]
        pos += 1
        val = (val << 7) | (b & 0x7F)
        if not b & 0x80:
            return val, pos


def read_smf(path: Path) -> Tuple[List[Dict[str, Any]], float]:
    """Read note events from a type 0/1 SMF.

    Returns (notes, first_bpm) with notes as {start, dur (sec), pitch, vel 0..1, channel}.
    Tempo changes are honoured.
    """
    data = path.read_bytes()
    if data[:4] != b"MThd":
        raise ValueError(f"{path.name} is not a Standard MIDI File")
    hlen = struct.unpack(">I", data[4:8])[0]
    _, ntrks, division = struct.unpack(">HHH", data[8:14])
    if division & 0x8000:
        raise ValueError("SMPTE time division is not supported")
    ppq = division
    pos = 8 + hlen

    tempo_events: List[Tuple[int, int]] = []  # (tick, us per quarter)
    raw_notes: List[Tuple[int, int, int, int, int]] = []  # (on_tick, off_tick, pitch, vel, channel)

    for _ in range(ntrks):
        if data[pos:pos + 4] != b"MTrk":
            break
        tlen = struct.unpack(">I", data[pos + 4:pos + 8])[0]
        p, end = pos + 8, pos + 8 + tlen
        tick, status = 0, 0
        open_notes: Dict[Tuple[int, int], List[Tuple[int, int]]] = {}
        while p < end:
            delta, p = _read_vlq(data, p)
            tick += delta
            b = data[p]
            if b & 0x80:
                status = b
                p += 1
            if status == 0xFF:
                mtype = data[p]
                mlen, p = _read_vlq(data, p + 1)
                if mtype == 0x51 and mlen == 3:
                    tempo_events.append((tick, int.from_bytes(data[p:p + 3], "big")))
                p += mlen
                if mtype == 0x2F:
                    break
                continue
            if status in (0xF0, 0xF7):
                slen, p = _read_vlq(data, p)
                p += slen
                continue
            kind, ch = status & 0xF0, status & 0x0F
            if kind in (0xC0, 0xD0):
                p += 1
                continue
            d1, d2 = data[p], data[p + 1]
            p += 2
            if kind == 0x90 and d2 > 0:
                open_notes.setdefault((ch, d1), []).append((tick, d2))
            elif kind == 0x80 or (kind == 0x90 and d2 == 0):
                stack = open_notes.get((ch, d1))
                if stack:
                    on_tick, vel = stack.pop(0)
                    raw_notes.append((on_tick, tick, d1, vel, ch))
        pos = end

    tempo_events.sort()
    if not tempo_events or tempo_events[0][0] != 0:
        tempo_events.insert(0, (0, tempo_events[0][1] if tempo_events else 500000))

    # Piecewise tick -> seconds conversion
    seg_ticks = np.array([t for t, _ in tempo_events], dtype=np.float64)
    seg_us = np.array([u for _, u in tempo_events], dtype=np.float64)
    seg_sec = np.zeros(len(tempo_events))
    for i in range(1, len(tempo_events)):
        seg_sec[i] = seg_sec[i - 1] + (seg_ticks[i] - seg_ticks[i - 1]) * seg_us[i - 1] / 1e6 / ppq

    def to_sec(tick: int) -> float:
        i = int(np.searchsorted(seg_ticks, tick, side="right") - 1)
        return float(seg_sec[i] + (tick - seg_ticks[i]) * seg_us[i] / 1e6 / ppq)

    notes = [
        {"start": to_sec(on), "dur": max(0.01, to_sec(off) - to_sec(on)), "pitch": pitch, "vel": vel / 127.0, "channel": ch}
        for on, off, pitch, vel, ch in sorted(raw_notes)
    ]
    return notes, 60e6 / tempo_events[0][1]


# --------------------------------------------------------------------------
# Humanization model
# --------------------------------------------------------------------------

def drum_role(pitch: int) -> str:
    if pitch in (35, 36):
        return "kick"
    if pitch in (37, 38, 39, 40):
        return "snare"
    return "hat"


# Per-role feel, in milliseconds at humanize = 1.0
ROLE_FEEL = {
    #          jitter  own-drift  backbeat lay-back  offbeat push
    "kick":  (1.5,    1.2,       0.0,               0.0),
    "snare": (2.0,    1.5,       5.0,               0.0),
    "hat":   (2.2,    1.5,       0.0,              -1.5),
    "bass":  (2.0,    1.5,       3.0,               0.0),
}
SIXTEENTH_ACCENT = {0: 0.08, 1: -0.10, 2: 0.03, 3: -0.07}


def _ou_series(times: np.ndarray, sigma: float, tau: float, rng: np.random.Generator) -> np.ndarray:
    """Ornstein-Uhlenbeck drift sampled at sorted times: smooth, mean-reverting wander."""
    out = np.zeros(times.size)
    if times.size == 0 or sigma <= 0:
        return out
    x = rng.normal(0.0, sigma)
    prev = times[0]
    for i, t in enumerate(times):
        dt = max(0.0, t - prev)
        decay = math.exp(-dt / tau)
        x = x * decay + sigma * math.sqrt(max(0.0, 1 - decay * decay)) * rng.normal()
        out[i] = x
        prev = t
    return out


def humanize_notes(
    parts: Dict[str, List[Dict[str, Any]]],
    bpm: float,
    downbeat_sec: float,
    settings: HumanizeSettings,
    seed: int,
) -> Dict[str, List[Dict[str, Any]]]:
    """Apply the human-feel model to {'drums': notes, 'bass': notes}.

    All parts share one band drift so the groove moves together; each
    instrument adds its own smaller drift and jitter.
    """
    amt = settings.humanize
    rng = np.random.default_rng(seed)
    sixteenth = 60.0 / max(1.0, bpm) / 4.0
    swing_delay = settings.swing * sixteenth / 3.0

    all_times = np.array(sorted({round(n["start"], 4) for notes in parts.values() for n in notes}))
    band = _ou_series(all_times, sigma=amt * 0.0025, tau=4.0, rng=rng)
    band_at = dict(zip(all_times.tolist(), band.tolist()))

    out: Dict[str, List[Dict[str, Any]]] = {}
    for part, notes in parts.items():
        notes = sorted(notes, key=lambda n: n["start"])
        roles = [drum_role(n["pitch"]) if part == "drums" else "bass" for n in notes]
        times = np.array([n["start"] for n in notes])
        own = {r: _ou_series(times, sigma=ROLE_FEEL[r][1] * amt / 1000.0, tau=1.5, rng=rng) for r in sorted(set(roles))}
        last_vel: Dict[int, float] = {}
        result = []
        for i, (n, role) in enumerate(zip(notes, roles)):
            jitter_ms, _, layback_ms, push_ms = ROLE_FEEL[role]
            _, beat, sub = pa.grid_position(n["start"], bpm, downbeat_sec)
            shift = band_at.get(round(n["start"], 4), 0.0) + own[role][i]
            shift += rng.normal(0.0, jitter_ms * amt / 1000.0)
            if sub == 0 and beat in (1, 3):
                shift += layback_ms * amt / 1000.0
            if sub in (1, 3):
                shift += push_ms * amt / 1000.0 + swing_delay

            accent = SIXTEENTH_ACCENT[sub] + (0.05 if (beat == 0 and sub == 0) else 0.0)
            vel = n["vel"] + amt * accent + rng.normal(0.0, 0.06 * amt)
            prev = last_vel.get(n["pitch"])
            if prev is not None and abs(vel - prev) < 0.025 * (1 + amt):
                vel += (0.04 if vel < 0.8 else -0.04) * amt  # avoid machine-gun identical hits
            vel = float(min(1.0, max(0.08, vel)))
            last_vel[n["pitch"]] = vel

            dur = n["dur"]
            if part == "bass":
                dur = max(0.04, dur * (1.0 + rng.normal(0.0, 0.08 * amt)))
            result.append({**n, "start": max(0.0, n["start"] + shift), "dur": dur, "vel": vel, "role": role})

        if getattr(settings, f"{part}_mode") == "layer":
            for note, source in zip(result, notes):
                note["start"] = source["start"]
        elif part == "drums" and (amt or settings.swing):
            # Lock any hat within 15 ms of a kick or snare to share the exact shifted onset (prevents flams).
            ks_anchors = [
                (notes[i]["start"], result[i]["start"])
                for i, r in enumerate(roles)
                if r in ("kick", "snare")
            ]
            if ks_anchors:
                ks_times = [t for t, _ in ks_anchors]
                for i, r in enumerate(roles):
                    if r != "hat":
                        continue
                    orig_t = notes[i]["start"]
                    pos = bisect.bisect_left(ks_times, orig_t)
                    best_shifted = None
                    best_dt = 0.015 + 1e-9
                    for cand in (pos - 1, pos, pos + 1):
                        if 0 <= cand < len(ks_anchors):
                            dt = abs(ks_anchors[cand][0] - orig_t)
                            if dt < best_dt:
                                best_dt = dt
                                best_shifted = ks_anchors[cand][1]
                    if best_shifted is not None:
                        result[i]["start"] = best_shifted

        out[part] = result
    return out


# --------------------------------------------------------------------------
# Audio helpers
# --------------------------------------------------------------------------

def load_audio(path: Path, sr: int) -> np.ndarray:
    """Load as float32 stereo (frames, 2) at the requested sample rate."""
    audio, file_sr = sf.read(str(path), always_2d=True, dtype="float32")
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    elif audio.shape[1] > 2:
        audio = audio[:, :2]
    if file_sr != sr:
        g = math.gcd(int(sr), int(file_sr))
        audio = scipy.signal.resample_poly(audio, sr // g, file_sr // g, axis=0).astype(np.float32)
    return audio


def fit_length(audio: np.ndarray, n: int) -> np.ndarray:
    if audio.shape[0] >= n:
        return audio[:n]
    return np.vstack([audio, np.zeros((n - audio.shape[0], audio.shape[1]), dtype=audio.dtype)])


def active_rms(audio: np.ndarray, sr: int) -> float:
    """RMS over the non-silent 100 ms blocks (so long silences don't skew level matching)."""
    mono = np.mean(audio, axis=1) if audio.ndim == 2 else audio
    blk = max(1, int(sr * 0.1))
    n = mono.size // blk
    if n == 0:
        return float(np.sqrt(np.mean(mono ** 2))) if mono.size else 0.0
    ms = np.mean(mono[: n * blk].reshape(n, blk).astype(np.float64) ** 2, axis=1)
    loud = ms[ms > (ms.max() * 1e-3)]
    return float(np.sqrt(np.mean(loud))) if loud.size else 0.0


def db_to_gain(db: float) -> float:
    return 10 ** (db / 20.0)


# --------------------------------------------------------------------------
# Drum kit: one-shots sampled from the song's own drum stem
# --------------------------------------------------------------------------

ROLE_MAX_LEN = {"kick": 0.28, "snare": 0.25, "hat": 0.14}
ROLE_ISOLATION = {"kick": ("snare",), "snare": ("kick",), "hat": ("kick", "snare")}


def _clean_one_shot(clip: np.ndarray, role: str, sr: int) -> np.ndarray:
    """Apply role-specific band-cleaning filters to strip cross-drum bleed."""
    clip = clip.astype(np.float32).copy()
    if role == "kick":
        sos = scipy.signal.butter(4, min(3500.0, sr * 0.45), btype="low", fs=sr, output="sos")
        clip = scipy.signal.sosfilt(sos, clip, axis=0)
    elif role == "snare":
        sos_hp = scipy.signal.butter(4, min(130.0, sr * 0.45), btype="high", fs=sr, output="sos")
        clip = scipy.signal.sosfilt(sos_hp, clip, axis=0)
        if clip.shape[0] > int(sr * 0.040):
            sos_lp = scipy.signal.butter(4, min(9000.0, sr * 0.45), btype="low", fs=sr, output="sos")
            lp_tail = scipy.signal.sosfilt(sos_lp, clip, axis=0)
            split = int(sr * 0.035)
            ramp = max(1, int(sr * 0.002))
            if split + ramp <= clip.shape[0]:
                fade = np.linspace(0.0, 1.0, ramp, dtype=np.float32)[:, None]
                clip[split:split + ramp] = clip[split:split + ramp] * (1.0 - fade) + lp_tail[split:split + ramp] * fade
                clip[split + ramp:] = lp_tail[split + ramp:]
            else:
                clip[split:] = lp_tail[split:]
    elif role == "hat":
        sos = scipy.signal.butter(4, min(5000.0, sr * 0.40), btype="high", fs=sr, output="sos")
        clip = scipy.signal.sosfilt(sos, clip, axis=0)
    return clip


def _shape_one_shot(clip: np.ndarray, sr: int) -> np.ndarray:
    clip = clip.astype(np.float32).copy()
    fi = min(clip.shape[0], max(1, int(sr * 0.001)))
    clip[:fi] *= np.linspace(0.0, 1.0, fi, dtype=np.float32)[:, None]
    fo = int(clip.shape[0] * 0.4)
    if fo > 1:
        clip[-fo:] *= (np.linspace(1.0, 0.0, fo, dtype=np.float32) ** 2)[:, None]
    peak = float(np.max(np.abs(clip)))
    return clip / peak if peak > 1e-6 else clip


def extract_one_shots(
    drum_audio: np.ndarray,
    sr: int,
    onsets: Dict[str, List[Tuple[float, float]]],
    per_role: int = 4,
) -> Dict[str, List[np.ndarray]]:
    """Cut isolated hits of each role out of the drum stem.

    A hit is used only if no other kick/snare starts inside its window, so
    the sample is a clean single drum. Several strong hits spread over the
    song become round-robin variations.
    """
    kit: Dict[str, List[np.ndarray]] = {}
    all_onsets = sorted(t_o for r_hits in onsets.values() for t_o, _ in r_hits)
    for role, hits in onsets.items():
        if role not in ROLE_MAX_LEN or not hits:
            continue
        max_len = ROLE_MAX_LEN[role]
        others = sorted(t for r in ROLE_ISOLATION[role] for t, _ in onsets.get(r, []))
        same = sorted(t for t, _ in hits)
        strengths = sorted(v for _, v in hits)
        floor = strengths[len(strengths) // 2] if strengths else 0.0  # top half only
        candidates: List[Tuple[float, float, float]] = []
        for t, v in hits:
            if v < floor:
                continue
            i_same = bisect.bisect_right(same, t + 0.01)
            nxt_same = same[i_same] if i_same < len(same) else None
            i_any = bisect.bisect_right(all_onsets, t + 0.045)
            nxt_any = all_onsets[i_any] if i_any < len(all_onsets) else None
            nxt = min((x for x in (nxt_same, nxt_any) if x is not None), default=None)
            length = min(max_len, (nxt - t - 0.005) if nxt else max_len)
            if length < min(max_len * 0.45, 0.09):
                continue
            if any(t - 0.02 < other < t + length for other in others):
                continue
            candidates.append((t, v, length))
        if not candidates:
            continue
        candidates.sort(key=lambda c: c[1], reverse=True)
        pool = candidates[: per_role * 3]
        pool.sort(key=lambda c: c[0])
        picks = [pool[int(round(i))] for i in np.linspace(0, len(pool) - 1, min(per_role, len(pool)))]
        shots = []
        for t, _, length in picks:
            a = max(0, int((t - 0.003) * sr))
            b = min(drum_audio.shape[0], int((t + length) * sr))
            if b - a > int(sr * 0.02):
                cleaned = _clean_one_shot(drum_audio[a:b], role, sr)
                shots.append(_shape_one_shot(cleaned, sr))
        if shots:
            kit[role] = shots
    return kit


def synth_one_shots(sr: int, rng: np.random.Generator) -> Dict[str, List[np.ndarray]]:
    """Fallback kit when the stem has no clean isolated hits."""
    kit: Dict[str, List[np.ndarray]] = {"kick": [], "snare": [], "hat": []}
    for v in range(3):
        n = int(sr * 0.4)
        t = np.arange(n) / sr
        f = 45 + 75 * np.exp(-t * (28 + 4 * v))
        kick = np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-t * 7.5)
        kick[: int(sr * 0.003)] += rng.normal(0, 0.3, int(sr * 0.003))
        kit["kick"].append(_shape_one_shot(np.repeat(kick[:, None], 2, axis=1), sr))

        n = int(sr * 0.3)
        t = np.arange(n) / sr
        noise = scipy.signal.sosfilt(scipy.signal.butter(2, [1200, 9000], btype="band", fs=sr, output="sos"), rng.normal(0, 1, n))
        snare = noise * np.exp(-t * 16) + 0.6 * np.sin(2 * np.pi * (185 + 6 * v) * t) * np.exp(-t * 25)
        kit["snare"].append(_shape_one_shot(np.repeat(snare[:, None], 2, axis=1), sr))

        n = int(sr * 0.12)
        t = np.arange(n) / sr
        hat = scipy.signal.sosfilt(scipy.signal.butter(4, 7000, btype="high", fs=sr, output="sos"), rng.normal(0, 1, n)) * np.exp(-t * (45 + 5 * v))
        kit["hat"].append(_shape_one_shot(np.repeat(hat[:, None], 2, axis=1), sr))
    return kit


PAD_GAIN = {37: 0.45, 38: 0.75, 39: 0.85, 44: 0.6, 46: 1.0, 49: 1.0, 51: 0.8}


def render_drums(notes: Sequence[Dict[str, Any]], kit: Dict[str, List[np.ndarray]], sr: int, n_frames: int,
                 rng: np.random.Generator) -> np.ndarray:
    out = np.zeros((n_frames, 2), dtype=np.float32)
    last_idx: Dict[str, int] = {}
    for n in notes:
        role = n.get("role") or drum_role(n["pitch"])
        shots = kit.get(role)
        if not shots:
            continue
        idx = int(rng.integers(len(shots)))
        if len(shots) > 1 and idx == last_idx.get(role):
            idx = (idx + 1) % len(shots)  # round robin: never the same sample twice in a row
        last_idx[role] = idx
        shot = shots[idx]
        start = int(n["start"] * sr)
        if start >= n_frames:
            continue
        end = min(n_frames, start + shot.shape[0])
        gain = (n["vel"] ** 1.6) * PAD_GAIN.get(int(n["pitch"]), 1.0)
        out[start:end] += shot[: end - start] * gain
    return out


# --------------------------------------------------------------------------
# Bass synth
# --------------------------------------------------------------------------

def render_bass(notes: Sequence[Dict[str, Any]], sr: int, n_frames: int) -> np.ndarray:
    """Small additive bass: warm harmonics, velocity-controlled brightness, ADSR."""
    out = np.zeros(n_frames, dtype=np.float64)
    attack, decay, sustain, release = 0.006, 0.12, 0.75, 0.07
    for n in notes:
        start = int(n["start"] * sr)
        if start >= n_frames:
            continue
        length = int((n["dur"] + release) * sr)
        end = min(n_frames, start + length)
        t = np.arange(end - start) / sr
        f0 = 440.0 * 2 ** ((n["pitch"] - 69) / 12.0)
        bright = 1.2 + 1.3 * (1.0 - n["vel"])  # softer notes roll off faster
        wave = np.zeros_like(t)
        for k in range(1, 9):
            if k * f0 > sr / 2.5:
                break
            wave += np.sin(2 * np.pi * k * f0 * t) / (k ** bright)
        env = np.where(t < attack, t / attack,
                       np.where(t < attack + decay, 1 - (1 - sustain) * (t - attack) / decay, sustain))
        rel_start = n["dur"]
        env = np.where(t > rel_start, env * np.clip(1 - (t - rel_start) / release, 0, 1), env)
        out[start:end] += np.tanh(1.2 * wave * env) * (n["vel"] ** 1.3)
    return np.repeat(out[:, None], 2, axis=1).astype(np.float32)


# --------------------------------------------------------------------------
# Master bus
# --------------------------------------------------------------------------

def limit(audio: np.ndarray, sr: int, ceiling_db: float, lookahead_ms: float = 5.0, release_ms: float = 80.0) -> np.ndarray:
    """True-peak-aware look-ahead limiter: instant (look-ahead) attack, smooth release.

    Peaks are detected on 4x-oversampled audio, so inter-sample peaks are
    caught by the limiter instead of needing a loudness-costing trim afterwards.
    """
    ceiling = db_to_gain(ceiling_db)
    n = audio.shape[0]
    over = scipy.signal.resample_poly(audio, 4, 1, axis=0)
    peak = np.max(np.abs(over[: n * 4]).reshape(-1, 4, audio.shape[1]), axis=(1, 2)) if over.shape[0] >= n * 4 else np.max(np.abs(audio), axis=1)
    g = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    if g.min() >= 1.0:
        return audio
    la = max(1, int(sr * lookahead_ms / 1000.0))
    gmin = scipy.ndimage.minimum_filter1d(g, size=2 * la + 1)
    a = math.exp(-1.0 / (sr * release_ms / 1000.0))
    zi = scipy.signal.lfilter_zi([1 - a], [1, -a]) * gmin[0]
    released, _ = scipy.signal.lfilter([1 - a], [1, -a], gmin, zi=zi)
    gain = np.minimum(gmin, released)
    gain = scipy.ndimage.uniform_filter1d(gain, size=la)
    return (audio * gain[:, None]).astype(np.float32)


def master(audio: np.ndarray, sr: int, target_lufs: float, ceiling_dbtp: float) -> Tuple[np.ndarray, Dict[str, Any]]:
    """Gain to target loudness through the limiter, then guarantee the true-peak ceiling.

    Limiting removes some loudness, so the gain is re-adjusted (up to 3
    passes) until the result lands within 0.2 LU of the target.
    """
    before = pa.measure_loudness(audio, sr)
    if before["lufs"] is None:
        return audio, {"input_lufs": None, "gain_db": 0.0, **before}
    limit_ceiling = ceiling_dbtp - 0.3  # small margin for differences between true-peak meters
    gain_db = max(-24.0, min(18.0, target_lufs - before["lufs"]))
    y, after = audio, before
    for _ in range(3):
        y = limit(audio * db_to_gain(gain_db), sr, limit_ceiling)
        after = pa.measure_loudness(y, sr)
        if after["lufs"] is None or abs(after["lufs"] - target_lufs) <= 0.2:
            break
        gain_db = max(-24.0, min(24.0, gain_db + (target_lufs - after["lufs"])))
    if after["true_peak"] is not None and after["true_peak"] > ceiling_dbtp - 0.2:
        y = y * db_to_gain(ceiling_dbtp - 0.2 - after["true_peak"])
        after = pa.measure_loudness(y, sr)
    return y.astype(np.float32), {"input_lufs": before["lufs"], "gain_db": round(gain_db, 2), **after}


# --------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------

def classify_stems(audio_stems_dir: Path) -> Dict[str, List[Path]]:
    groups: Dict[str, List[Path]] = {"vocals": [], "drums": [], "bass": [], "instruments": []}
    for wav in pa.visible_wavs(audio_stems_dir):
        kind = pa.stem_kind(wav, audio_stems_dir.parent.name)
        groups[kind].append(wav)
    return groups


def load_stem_buses(stems_dir: Path) -> Tuple[int, int, Dict[str, np.ndarray]]:
    """Load prepped stems summed into vocals / instruments / drums / bass buses (same length & rate)."""
    groups = classify_stems(stems_dir)
    all_stems = [p for g in groups.values() for p in g]
    if not all_stems:
        raise FileNotFoundError(f"No prepped stems in {stems_dir}")
    sr = int(sf.info(str(all_stems[0])).samplerate)
    loaded = {k: [load_audio(p, sr) for p in v] for k, v in groups.items()}
    n_frames = max(a.shape[0] for v in loaded.values() for a in v)
    buses = {k: (np.sum([fit_length(a, n_frames) for a in v], axis=0).astype(np.float32) if v
                 else np.zeros((n_frames, 2), np.float32))
             for k, v in loaded.items()}
    return sr, n_frames, buses


def _write_wav_atomic(path: Path, audio: np.ndarray, sr: int) -> None:
    """Atomically write a 24-bit PCM WAV file via a .tmp.wav staging file."""
    tmp = path.with_name(f".{path.stem}.tmp.wav")
    sf.write(str(tmp), audio, sr, subtype="PCM_24")
    os.replace(tmp, path)


def write_render(paths: pa.PipelinePaths, name: str, audio: np.ndarray, sr: int, ffmpeg_bin: str) -> Path:
    """Atomically write a 24-bit render to 05_Mix_Renders and its Mix QA report."""
    paths.renders.mkdir(parents=True, exist_ok=True)
    out_wav = paths.renders / f"{name}.wav"
    _write_wav_atomic(out_wav, audio, sr)
    pa.write_qa_report(out_wav, ffmpeg_bin=ffmpeg_bin)
    return out_wav


def render_rough_mix(paths: pa.PipelinePaths, track: str, target_lufs: Optional[float] = None,
                     ceiling_dbtp: Optional[float] = None, ffmpeg_bin: str = "ffmpeg") -> Path:
    """Reference mix: the prepped stems as-is (original drums & bass), mastered to the
    same loudness target as the humanized mix so the two can be A/B compared fairly."""
    settings = load_settings(paths.prepped / track)
    sr, _, buses = load_stem_buses(paths.prepped / track / "Audio_Stems")
    mix = np.sum(list(buses.values()), axis=0).astype(np.float32)
    mastered, loud = master(mix, sr, target_lufs if target_lufs is not None else settings.target_lufs,
                            ceiling_dbtp if ceiling_dbtp is not None else settings.ceiling_dbtp)
    out = write_render(paths, f"{track}_RoughMix", mastered, sr, ffmpeg_bin)
    log.info("[%s] Rough mix written -> %s (%.1f LUFS)", track, out.name, loud.get("lufs") or float("nan"))
    return out


def pending_rough(paths: pa.PipelinePaths) -> List[str]:
    """Prepped tracks with stems but no <Track>_RoughMix.wav (and no unresolved failure)."""
    reg = pa.failures(paths)
    out = []
    for d in pa.visible_dirs(paths.prepped):
        stems = pa.visible_wavs(d / "Audio_Stems")
        if not (d / ".done").exists() or not stems:
            continue
        if (paths.renders / f"{d.name}_RoughMix.wav").exists():
            continue
        if reg.is_blocked("rough_mix", d.name, pa.fingerprint(stems)):
            continue
        out.append(d.name)
    return out


def run_rough(paths: pa.PipelinePaths, track: str, ffmpeg_bin: str = "ffmpeg") -> Optional[Path]:
    """render_rough_mix() with failure recording."""
    reg = pa.failures(paths)
    stems = pa.visible_wavs(paths.prepped / track / "Audio_Stems")
    try:
        out = render_rough_mix(paths, track, ffmpeg_bin=ffmpeg_bin)
        reg.clear("rough_mix", track)
        return out
    except Exception as exc:
        log.debug("Rough mix traceback", exc_info=True)
        reg.record("rough_mix", track, pa.fingerprint(stems), f"{type(exc).__name__}: {exc}")
        return None


def run_mix_stages(paths: pa.PipelinePaths, ffmpeg_bin: str = "ffmpeg", humanize: bool = True) -> int:
    """Render any missing rough mixes and (optionally) humanized mixes. Returns renders written."""
    count = 0
    for track in pending_rough(paths):
        count += run_rough(paths, track, ffmpeg_bin) is not None
    if humanize:
        for track in pending_humanized(paths):
            count += run_humanized(paths, track, ffmpeg_bin=ffmpeg_bin) is not None
    return count


def humanized_inputs(paths: pa.PipelinePaths, track: str) -> List[Path]:
    d = paths.prepped / track
    return pa.visible_wavs(d / "Audio_Stems") + sorted((d / "MIDI").glob(f"{track}_*.mid"))


def pending_humanized(paths: pa.PipelinePaths) -> List[str]:
    """Tracks with finished MIDI but no humanized mix yet (and no unresolved failure)."""
    reg = pa.failures(paths)
    out = []
    for d in pa.visible_dirs(paths.prepped):
        if not (d / "MIDI" / ".midi_done").exists():
            continue
        if (paths.renders / f"{d.name}_Humanized.wav").exists():
            continue
        if not pa.visible_wavs(d / "Audio_Stems"):
            continue
        if reg.is_blocked("humanized_mix", d.name, pa.fingerprint(humanized_inputs(paths, d.name))):
            continue
        out.append(d.name)
    return out


def render_humanized_mix(
    paths: pa.PipelinePaths,
    track: str,
    settings: Optional[HumanizeSettings] = None,
    ffmpeg_bin: str = "ffmpeg",
) -> Dict[str, Any]:
    """Build the humanized mix for one track. Returns a summary dict; raises on failure."""
    t0 = time.monotonic()
    track_dir = paths.prepped / track
    stems_dir = track_dir / "Audio_Stems"
    midi_dir = track_dir / "MIDI"
    settings = (settings or load_settings(track_dir)).validated()
    seed = track_seed(track, settings)
    rng = np.random.default_rng(seed)

    sr, n_frames, stem = load_stem_buses(stems_dir)

    meta: Dict[str, Any] = {}
    try:
        meta = json.loads((track_dir / "track_metadata.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass

    # 1. Read the clean MIDI parts
    parts: Dict[str, List[Dict[str, Any]]] = {}
    bpm = float(meta.get("estimated_bpm") or 120.0)
    drums_mid = midi_dir / f"{track}_FPC_Drums.mid"
    bass_mid = midi_dir / f"{track}_Bass.mid"
    if drums_mid.is_file():
        parts["drums"], bpm = read_smf(drums_mid)
    if bass_mid.is_file():
        parts["bass"], _ = read_smf(bass_mid)
    if not any(parts.values()):
        raise ValueError("No playable drum or bass MIDI notes for this track")
    downbeat = float(meta.get("downbeat_sec") or 0.0)

    # 2. Humanize and save the performance for FL Studio
    human = humanize_notes(parts, bpm, downbeat, settings, seed)
    if human.get("drums"):
        pa.write_smf_midi(midi_dir / f"{track}_FPC_Drums_Humanized.mid",
                          [pa.notes_to_midi_track(f"{track} FPC Drums (Humanized)", human["drums"], bpm, channel=9)])
    if human.get("bass"):
        pa.write_smf_midi(midi_dir / f"{track}_Bass_Humanized.mid",
                          [pa.notes_to_midi_track(f"{track} Bass (Humanized)", human["bass"], bpm, channel=0)])

    out_stems = track_dir / HUMANIZED_STEMS_DIR
    out_stems.mkdir(parents=True, exist_ok=True)
    summary: Dict[str, Any] = {"track": track, "seed": seed, "bpm": bpm, "settings": settings.to_dict()}

    # 3a. Drums
    drums_bus = stem["drums"]
    if human.get("drums") and settings.drums_mode != "original":
        onsets: Dict[str, List[Tuple[float, float]]] = {}
        for role, pattern in (("kick", "*Kick_Trigger.wav"), ("snare", "*Snare_Trigger.wav"), ("hat", "*Hat_Trigger.wav")):
            for trig in sorted((track_dir / "Drum_Triggers").glob(pattern)):
                audio, tsr = sf.read(str(trig), always_2d=True)
                idx, strength = pa.detect_onsets(np.mean(audio, axis=1), tsr)
                onsets.setdefault(role, []).extend((i / tsr, float(v)) for i, v in zip(idx, strength))
        kit = extract_one_shots(stem["drums"], sr, onsets) if np.any(stem["drums"]) else {}
        synth = synth_one_shots(sr, rng)
        summary["drum_samples"] = {r: (len(kit[r]) if r in kit else 0) for r in ("kick", "snare", "hat")}
        for r in ("kick", "snare", "hat"):
            kit.setdefault(r, synth[r])
        performed = render_drums(human["drums"], kit, sr, n_frames, rng)
        ref, got = active_rms(stem["drums"], sr), active_rms(performed, sr)
        if ref > 0 and got > 0:
            performed *= ref / got
        _write_wav_atomic(out_stems / f"{track}_Drums_Performed.wav", performed, sr)
        if settings.drums_mode == "replace":
            if settings.keep_cymbals > 0:
                air = scipy.signal.sosfilt(
                    scipy.signal.butter(4, min(7000.0, sr * 0.45), btype="high", fs=sr, output="sos"),
                    stem["drums"],
                    axis=0,
                )
                all_stem_onsets = [t for hits in onsets.values() for t, _ in hits]
                if not all_stem_onsets:
                    all_stem_onsets = [n["start"] for n in parts["drums"]]
                if all_stem_onsets:
                    duck = np.ones(n_frames, dtype=np.float32)
                    half_w = int(0.030 * sr)
                    for t_on in all_stem_onsets:
                        c = int(t_on * sr)
                        lo = max(0, c - half_w)
                        hi = min(n_frames, c + half_w)
                        if hi > lo:
                            duck[lo:hi] = 0.15
                    duck = scipy.ndimage.uniform_filter1d(duck, size=max(1, int(sr * 0.005)))
                    air = air * duck[:, None]
                drums_bus = performed + settings.keep_cymbals * air.astype(np.float32)
            else:
                drums_bus = performed
        else:
            drums_bus = (1 - settings.drums_blend) * stem["drums"] + settings.drums_blend * performed

    # 3b. Bass
    bass_bus = stem["bass"]
    if human.get("bass") and settings.bass_mode != "original":
        performed_bass = render_bass(human["bass"], sr, n_frames)
        ref, got = active_rms(stem["bass"], sr), active_rms(performed_bass, sr)
        if ref > 0 and got > 0:
            performed_bass *= ref / got
        _write_wav_atomic(out_stems / f"{track}_Bass_Performed.wav", performed_bass, sr)
        bass_bus = performed_bass if settings.bass_mode == "replace" else (
            (1 - settings.bass_blend) * stem["bass"] + settings.bass_blend * performed_bass)

    # 4. Mix and master
    mix = (stem["vocals"] * db_to_gain(settings.vocals_db)
           + stem["instruments"] * db_to_gain(settings.instruments_db)
           + drums_bus * db_to_gain(settings.drums_db)
           + bass_bus * db_to_gain(settings.bass_db)).astype(np.float32)
    mastered, loud = master(mix, sr, settings.target_lufs, settings.ceiling_dbtp)

    out_wav = write_render(paths, f"{track}_Humanized", mastered, sr, ffmpeg_bin)

    summary.update({
        "output": str(out_wav),
        "loudness": loud,
        "notes": {k: len(v) for k, v in human.items()},
        "rendered_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "seconds": round(time.monotonic() - t0, 1),
    })
    pa.atomic_write_text(track_dir / SETTINGS_FILE, json.dumps({**settings.to_dict(), "seed": seed, "last_render": summary}, indent=2))
    log.info("[%s] Humanized mix written -> %s (%.1f LUFS, seed %d, %.1fs)", track, out_wav.name,
             loud.get("lufs") or float("nan"), seed, summary["seconds"])
    return summary


def run_humanized(paths: pa.PipelinePaths, track: str, settings: Optional[HumanizeSettings] = None,
                  ffmpeg_bin: str = "ffmpeg") -> Optional[Dict[str, Any]]:
    """render_humanized_mix() with failure recording (used by the watcher and the API)."""
    reg = pa.failures(paths)
    try:
        result = render_humanized_mix(paths, track, settings, ffmpeg_bin)
        reg.clear("humanized_mix", track)
        return result
    except Exception as exc:
        log.debug("Humanized mix traceback", exc_info=True)
        reg.record("humanized_mix", track, pa.fingerprint(humanized_inputs(paths, track)), f"{type(exc).__name__}: {exc}")
        return None
