# Suno-Music-Creator: Zero-Fingerprint Humanization Pipeline

An automated, hands-free production pipeline designed to transform raw **Suno** generations into authentic, human-grade multitrack masters using **FL Studio (FPC / NewTone / Edison)**, **Moises**, **Scaler 3.1**, **MPC 3 Beats**, **TONIQ**, and a multi-agent AI orchestration stack (**Antigravity 2.0, MoiAI, Claude, Gemini, and ChatGPT**).

---

## Core Strategy: The "Trojan Horse" Stem-Swap Pipeline

Distribution algorithms and human listeners flag raw Suno tracks based on three acoustic giveaways:
1. **Phase-smeared high frequencies** (metallic cymbals and reverb tails between 10 kHz and 18 kHz).
2. **Hyper-compressed flat dynamics** (brickwalled sausage waveforms lacking real transient crest factor).
3. **Microscopic spectral watermarks** embedded in the raw synthesis render.

Instead of merely EQing a full Suno stereo file, this pipeline uses Suno strictly as a **composition/arrangement sketchpad and vocal/ear-candy source**, while replacing **80%+ of the sonic energy** (drums, bass, and core harmonic instruments) with pristine local VSTs and multi-velocity drum samples.

---

## Repository Structure

```text
Suno-Music-Creator/
├── README.md                                      # Architecture & quick-start overview
├── docs/
│   └── WORKFLOW_GUIDE.md                          # Complete 6-stage guide, Vocal FX chain, Scaler 3.1, FPC & MPC Beats
├── prompts/
│   └── AI_AGENT_PROMPTS.md                        # System prompts for MoiAI, Claude, Gemini & ChatGPT
├── scripts/
│   ├── antigravity/
│   │   └── suno_scrubber_daemon.py                # Watchdog daemon: FFmpeg de-watermarking + Drum Trigger splitter
│   └── fl_studio/
│       ├── FPC_Moises_Humanizer.pyscript          # Maps Moises drum MIDI to FPC pads & cycles 16 velocity layers
│       ├── Gaussian_Humanize.pyscript             # Gaussian micro-timing, chord strum cascade & velocity drift
│       └── Stem_MIDI_Cleaner.pyscript             # Purges Moises ghost notes & maps drums to MPC 3 Beats Bank A
└── push_to_github_pr.py                           # Automated Git branch, commit, push & PR creation script
```

---

## AI Agent Division of Labor

| AI Tool | Primary Role in Pipeline | Automated Task |
| :--- | :--- | :--- |
| **Antigravity 2.0** | Master Local Orchestrator & Code Engine | Runs `suno_scrubber_daemon.py` folder-watcher, executes batch FFmpeg audio scrubbing & drum trigger splitting, and deploys FL Studio scripts. |
| **MoiAI (AI Moi)** | Desktop UI & Cross-App Automator | Watches `/01_Suno_Inbox`, triggers Moises separation (WAV stems + BPM/Key/Chords), and launches the populated FL Studio `.flp` project. |
| **Claude** | Lyric & Structural Architect | Generates dry, stem-friendly Suno prompts/lyrics (~200 words, `[Square Bracket]` cues) and maintains FL Studio `.pyscript` algorithms. |
| **Gemini** | Multimodal Audio QA & Spec Analyzer | Audits the rough FL Studio render against commercial spectral benchmarks (10–18 kHz shimmer check, LUFS, and transient crest factor). |
| **ChatGPT** | Metadata & Release Packaging | Generates track descriptions, ISRC/ID3 tagging schemas, and DSP release copy while the final master renders. |

---

## Local Directory Pipeline Structure

Create the following directory tree on your workstation (`C:/Music_Pipeline`):

```text
C:/Music_Pipeline
 ├── 01_Suno_Inbox/         # Drop raw Suno WAV here
 ├── 02_Moises_Stems/       # MoiAI auto-exports separated WAVs + BPM/Key metadata here
 ├── 03_Scrubbed_Audio/     # Antigravity auto-runs pitch/phase cleanup on stems
 ├── 04_FL_Project_Ready/   # Auto-populated with scrubbed stems, drum triggers & .flp template
 └── Templates/
     └── Humanizer_Template.flp
```

---

## Quick Start

1. **Install Python Dependencies for Antigravity 2.0:**
   ```bash
   pip install watchdog
   ```
   *(Ensure `ffmpeg` is installed and available on your system PATH).*
2. **Install FL Studio Piano Roll Scripts:**
   Copy all `.pyscript` files from `scripts/fl_studio/` into:
   `Documents/Image-Line/FL Studio/Settings/Piano roll scripts/`
3. **Start the Antigravity Scrubber Daemon:**
   ```bash
   python scripts/antigravity/suno_scrubber_daemon.py
   ```
