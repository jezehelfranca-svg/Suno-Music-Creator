"""Synthetic pipeline fixtures so tests run on any machine (no real music library needed)."""

from __future__ import annotations

from pathlib import Path
from typing import Sequence

import numpy as np
import soundfile as sf

import pipeline_automator as pa

SR = 44100


def _place(buf: np.ndarray, times: Sequence[float], shot: np.ndarray) -> None:
    for t in times:
        i = int(t * SR)
        e = min(len(buf), i + len(shot))
        if i < len(buf):
            buf[i:e] += shot[: e - i]


def make_prepped_track(paths: pa.PipelinePaths, name: str = "Demo", seconds: float = 12.0,
                       bpm: float = 120.0, pickup: float = 0.25) -> Path:
    """Create 03_Prepped_Stems/<name> with drum/bass/vocal/instrument stems, triggers and .done."""
    rng = np.random.default_rng(7)
    n = int(SR * seconds)
    beat = 60.0 / bpm
    t = np.arange(int(SR * 0.3)) / SR
    kick = np.sin(2 * np.pi * np.cumsum(50 + 80 * np.exp(-t * 30)) / SR) * np.exp(-t * 9)
    snare = rng.normal(0, 0.5, t.size) * np.exp(-t * 18)
    ht = np.arange(int(SR * 0.05)) / SR
    hat = rng.normal(0, 0.2, ht.size) * np.exp(-ht * 60)
    beats = int((seconds - pickup) / beat)
    kicks = [pickup + i * beat for i in range(0, beats, 2)]
    snares = [pickup + i * beat for i in range(1, beats, 2)]
    hats = [pickup + i * beat / 2 for i in range(beats * 2)]
    kb, sb, hb = np.zeros(n), np.zeros(n), np.zeros(n)
    _place(kb, kicks, kick)
    _place(sb, snares, snare)
    _place(hb, hats, hat)

    td = paths.prepped / name
    (td / "Audio_Stems").mkdir(parents=True, exist_ok=True)
    (td / "Drum_Triggers").mkdir(exist_ok=True)
    sf.write(str(td / "Audio_Stems" / f"{name}_drums_prep.wav"), np.column_stack([kb + sb + hb] * 2) * 0.5, SR)
    sf.write(str(td / "Drum_Triggers" / f"{name}_drums_prep_Kick_Trigger.wav"), kb, SR)
    sf.write(str(td / "Drum_Triggers" / f"{name}_drums_prep_Snare_Trigger.wav"), sb, SR)
    sf.write(str(td / "Drum_Triggers" / f"{name}_drums_prep_Hat_Trigger.wav"), hb, SR)
    tt = np.arange(n) / SR
    f = np.where((tt % 4) < 2, 55.0, 73.42)
    sf.write(str(td / "Audio_Stems" / f"{name}_bass_prep.wav"), 0.4 * np.sin(2 * np.pi * np.cumsum(f) / SR), SR)
    sf.write(str(td / "Audio_Stems" / f"{name}_vocals_prep.wav"), 0.1 * np.sin(2 * np.pi * 440 * tt), SR)
    sf.write(str(td / "Audio_Stems" / f"{name}_instruments_prep.wav"), 0.1 * np.sin(2 * np.pi * 261.6 * tt), SR)
    (td / ".done").write_text("done", encoding="utf-8")
    return td


def make_render(paths: pa.PipelinePaths, stem: str, seconds: float = 6.0) -> Path:
    paths.renders.mkdir(parents=True, exist_ok=True)
    t = np.arange(int(SR * seconds)) / SR
    x = 0.3 * np.sin(2 * np.pi * 220 * t)
    out = paths.renders / f"{stem}.wav"
    sf.write(str(out), np.column_stack([x, x]), SR)
    return out
