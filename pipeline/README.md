# Suno Sketch-to-Production Pipeline

A practical workflow for turning a **Suno** idea into a fully produced, editable multitrack in **FL Studio**, using **Moises** (stem separation), **Scaler 3.1** (harmony), **FPC / MPC Beats** (drums), **NewTone / Edison / Slicex / TONIQ** (audio-to-MIDI) and a few AI assistants (Antigravity, MoiAI, Claude, Gemini, ChatGPT) to handle the busywork.

---

## Approach: Suno as a sketchpad, you as the producer

Suno is great at fast composition and arrangement ideas, but a rendered stereo file is hard to mix, edit or develop further. This pipeline treats the Suno output as a **sketch**:

1. Separate it into stems with Moises.
2. Convert the parts that matter (drums, bass, chords, hooks) to **MIDI**.
3. Re-produce those parts with **your own instruments, kits and VSTs**, keeping the Suno vocal or ear-candy stems where they work.

Why bother: you get **editable MIDI**, full control over sound selection, cleaner low end and transients than a separated stem can give you, and a project you can actually mix, rearrange and recall.

---

## Repository layout (`pipeline/`)

```text
pipeline/
├── README.md                              # This overview + quick start
├── ANTIGRAVITY_HANDOFF.md                 # Paste-in prompt for setting everything up via Google Antigravity
├── docs/
│   └── WORKFLOW_GUIDE.md                  # Full 6-stage guide: Scaler 3.1, stem-to-MIDI, FPC vs MPC, vocal chain, routing
├── prompts/
│   └── AI_AGENT_PROMPTS.md                # Prompts for MoiAI, Claude, Gemini, ChatGPT
└── scripts/
    ├── stem_prep/
    │   ├── stem_prep.py                   # Stem prep tool: tonal cleanup presets + drum trigger splitting
    │   ├── requirements.txt               # Optional: watchdog (for --watch)
    │   └── tests/
    └── fl_studio/
        ├── FPC_Drum_Mapper_Humanizer.pyscript   # Drum MIDI cleanup, FPC pad mapping, velocity/timing humanization
        ├── Groove_Humanize.pyscript             # Timing/velocity humanization, chord strum, laid-back backbeat
        ├── Stem_MIDI_Cleaner.pyscript           # Removes ghost/bleed notes, optional drum pad mapping
        └── tests/
```

---

## AI assistant division of labour

| Tool | Role | Typical task |
| :--- | :--- | :--- |
| **Antigravity** | Local setup & code agent | Sets up folders, runs `stem_prep.py`, installs FL scripts, runs tests (see `ANTIGRAVITY_HANDOFF.md`). |
| **MoiAI** | Desktop / cross-app automation | Watches `01_Suno_Inbox`, runs Moises separation (stems + BPM/key/chords), opens the FL project. |
| **Claude** | Prompt & lyric writer, script maintainer | Writes stem-friendly Suno prompts/lyrics and maintains the `.pyscript` tools. |
| **Gemini** | Mix QA listener | Reviews the rough mix: harshness, sibilance, low end, loudness/true peak, timing; returns a timestamped fix list. |
| **ChatGPT** | Release packaging | Drafts honest metadata, descriptions and social copy, including an AI-assistance disclosure. |

---

## Working folders

Default base directory is `C:/Music_Pipeline` (override with `--base-dir` or the `MUSIC_PIPELINE_DIR` environment variable).

```text
C:/Music_Pipeline
 ├── 01_Suno_Inbox/                              # Raw Suno downloads
 ├── 02_Moises_Stems/<Track>/                    # Separated stems from Moises (*.wav)
 ├── 03_Prepped_Stems/<Track>/
 │    ├── Audio_Stems/<stem>_prep.wav            # Tonal cleanup per preset
 │    ├── Drum_Triggers/<drumstem>_Kick_Trigger.wav, _Snare_Trigger.wav, _Hat_Trigger.wav
 │    └── .done                                  # Marker: track already processed (delete to re-run)
 ├── 04_FL_Project/<Track>/<Track>.flp           # Copied from Templates/Project_Template.flp if present
 ├── 05_Mix_Renders/                             # Exported mixes for QA
 └── Templates/
      └── Project_Template.flp
```

---

## Stem prep tool (`scripts/stem_prep/stem_prep.py`)

Picks up each track folder in `02_Moises_Stems/`, writes prepped stems and drum triggers to `03_Prepped_Stems/<Track>/`, and sets up `04_FL_Project/<Track>/`.

| Option | Meaning |
| :--- | :--- |
| `--once` *(default)* | Process everything waiting, then exit. |
| `--watch` | Keep running and process new track folders as they appear (uses `watchdog` if installed, otherwise polling). |
| `--poll-interval SECS` | Polling interval when `watchdog` isn't available. |
| `--dry-run` | Print what would happen; write nothing. |
| `--preset off\|gentle\|bright-tame` | Tonal cleanup: `off` = copy only, `gentle` *(default)* = light high-pass/low-pass tidy-up, `bright-tame` = stronger top-end softening for harsh stems. |
| `--base-dir DIR` | Pipeline root (default `C:/Music_Pipeline`). |

**Drum triggers:** any drum stem is split into band-limited, gated `Kick`, `Snare` and `Hat` trigger WAVs, which convert to MIDI much more cleanly than the full drum stem (Edison, Slicex, or your sampler of choice).

---

## Quick start

1. **Prerequisites:** Python 3.9+, and `ffmpeg` on your PATH (`ffmpeg -version` should work).
2. **Optional (for `--watch` with file events):**
   ```bash
   pip install -r pipeline/scripts/stem_prep/requirements.txt
   ```
3. **Install the FL Studio piano-roll scripts:** copy the three `.pyscript` files from `pipeline/scripts/fl_studio/` into
   `Documents/Image-Line/FL Studio/Settings/Piano roll scripts/`, then in the Piano Roll use **Tools > Scripting** or `Alt+Y` to re-run the last script.
4. **Run the stem prep tool:**
   ```bash
   python pipeline/scripts/stem_prep/stem_prep.py --base-dir C:/Music_Pipeline --dry-run   # preview
   python pipeline/scripts/stem_prep/stem_prep.py --base-dir C:/Music_Pipeline --once      # process what's there
   python pipeline/scripts/stem_prep/stem_prep.py --base-dir C:/Music_Pipeline --watch     # keep watching
   ```
5. **Run the tests (optional):**
   ```bash
   python3 -m unittest discover -s pipeline/scripts/stem_prep/tests -t pipeline/scripts/stem_prep
   python3 -m unittest discover -s pipeline/scripts/fl_studio/tests -t pipeline/scripts/fl_studio
   ```

Then follow `docs/WORKFLOW_GUIDE.md`.

---

## Responsible use

- **Disclose AI assistance** wherever your distributor, platform or collaborators require it. The ChatGPT release prompt includes a disclosure field for this.
- **Respect Suno's terms for your plan.** Commercial use of Suno output depends on your subscription tier; check it before releasing.
- **Check your distributor's AI-content policy** before submission.
- This pipeline is for production quality and control. It does not, and should not be extended to, remove watermarks, alter provenance data or evade AI-content detection.
