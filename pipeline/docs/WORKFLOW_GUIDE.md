# Sketch-to-Production Workflow Guide

Folder names refer to the base directory (default `C:/Music_Pipeline`); see `../README.md` for the full tree.

---

## 1. The 6-stage workflow

### Stage 1: Stem-friendly Suno generation (Claude + Suno)
* Have **Claude** write lyrics and a style prompt aimed at clean separation (prompt in `../prompts/AI_AGENT_PROMPTS.md`).
* **Style suffix that helps Moises:** `dry studio recording, isolated stems, tight transients, minimal reverb, uncompressed studio mix`.
* Download the full WAV into `01_Suno_Inbox/`.

### Stage 2: Stem separation & prep (MoiAI + Moises + `stem_prep.py`)
* **Moises:** split into 5–6 stems (`Vocals`, `Drums`, `Bass`, `Keys/Guitar`, `Other`) and grab **BPM, key and chord map**. Export to `02_Moises_Stems/<Track>/`.
* **Stem prep** (`pipeline/scripts/stem_prep/stem_prep.py`):
  * Writes `03_Prepped_Stems/<Track>/Audio_Stems/<stem>_prep.wav` using the chosen preset: `off` (copy only), `gentle` (default, light high-/low-pass tidy-up), or `bright-tame` (stronger top-end softening for harsh, fizzy stems).
  * Splits the drum stem into `<drumstem>_Kick_Trigger.wav`, `_Snare_Trigger.wav` and `_Hat_Trigger.wav` in `Drum_Triggers/` for clean audio-to-MIDI.
  * Copies `Templates/Project_Template.flp` (if present) to `04_FL_Project/<Track>/<Track>.flp`, and writes a `.done` marker so the track isn't processed twice.

### Stage 3: Harmony & MIDI parts (Scaler 3.1)
* Load the `Keys/Other` and `Bass` stems into **Scaler 3.1** with **Audio Detection**.
* **Auto Voice Leading & Colors:** select the detected chords on the Arrange page, click **Auto Voice Leading** so inversions flow from the first chord, then try 7th/9th voicings from **Colors**.
* **Bass Follow + Scissor tool:** add a **Bass Follow** track, slice rhythmic variations with the **Scissor** tool, and route/drag the MIDI to your bass instrument.
* **Melody Motion, call-and-response:** add a **Melody Motion** lane in **Scale Mode** (switch the final turnaround bar to **Chord Mode** with the Scissor tool). Split the melody every bar and `Shift+Click` to mute bars where the lead vocal sings.
* **Live Sync in FL Studio:** enable **Live Sync Lead** on the main Scaler instance (3-dot menu). Additional Scaler instances join as **Live Sync Followers** and follow chord changes in real time.

### Stage 4: Drum re-production (FPC or MPC Beats)
* Mute the original drum stem (keep it for reference).
* Convert the groove to MIDI (Section 3B) and play it through a multi-velocity kit in **FPC** (recommended) or **MPC Beats**.
* Run **FPC Drum Mapper & Humanizer** on the drum MIDI (Section 5).

### Stage 5: Vocal production & arrangement polish (FL Studio)
* Run the prepped vocal through the **Vocal Mixer Chain** (Section 2).
* Optionally layer a real vocal double, whisper track or harmony underneath at around `-9 dB`.
* Run **Groove Humanizer** on Scaler / melodic MIDI channels.

### Stage 6: Mix QA & render (Gemini + FL Studio)
* Export a 24-bit WAV to `05_Mix_Renders/` and give it to **Gemini** with the mix-QA prompt: harshness (8–16 kHz), sibilance, low-end balance, LUFS / true peak, crest factor, timing — returned as a timestamped fix list.
* As a rough pre-master target, aim for around `-10` to `-12 LUFS` integrated with healthy transients; adjust to your genre and mastering plan.

---

## 2. Vocal Mixer Chain (Mixer Track 5)

The EQ frequencies and amounts below are **starting points** — sweep and adjust by ear for each vocal.

| Slot | Plugin | Starting settings | Purpose |
| :--- | :--- | :--- | :--- |
| **1** | **Fruity Parametric EQ 2** | • Band 1 high-pass: Steep 8, `95 Hz`<br>• Band 4 peak: `-4.2 dB` at `4650 Hz`, `Q 4.0`<br>• Band 6 peak: `-3.0 dB` at `7800 Hz`, `Q 3.5`<br>• Band 7 low-pass: Gentle 4, `16 kHz` | Removes rumble, tames harsh resonances and fizzy top end left by separation. |
| **2** | **Maximus** (de-ess / gate) | • Low band (`180–350 Hz`): upward compression `+1.5 dB` for chest weight<br>• Mid band: gate threshold `-42 dB` to mute separation bleed between phrases<br>• High band (`5.5 kHz+`): `0.5 ms` attack, `-4.5 dB` ceiling | Cleans the noise floor between lines and controls sibilance. |
| **3** | **Fruity Waveshaper / Blood Overdrive** | • Drive `0.15`, mix `~18%` | Subtle harmonic saturation for presence and warmth. |
| **4** *(optional)* | **Pitcher / NewTone** | • Light pitch correction (Humanize speed `Medium`)<br>• Optional formant tweak of about `±0.2` semitones | Creative tuning / tone-shaping, e.g. to sit the vocal better against your new instruments. Skip if the vocal already works. |
| **5** | **Fruity Convolver** (send) | • Small wood studio room IR, pre-delay `18 ms`, wet `14%`, high-cut `6 kHz` | Puts the dry vocal in the same space as your instruments and drums. |

---

## 3. Stem-to-MIDI conversion in FL Studio

### A. Pitched parts (melodies, bass, chords)
1. **Lock the BPM first:** set the project to the Moises BPM and set audio clips to **Stretch** mode.
2. **Monophonic bass / hooks (NewTone):** load the bass or mono lead stem into **NewTone**, lower **Variation** to about `20%`, then **Send to piano roll**.
3. **Polyphonic parts (Edison or TONIQ):**
   * *Edison:* load the stem, select the riff, **Wrench > Convert to score and dump to piano roll**.
   * *TONIQ (free version):* the free version supports Polyphonic and Melodic modes on isolated stems; drag the resulting MIDI into FL's Channel Rack.
4. **Clean up:** enable **Snap to Scale** in the Piano Roll (match the Scaler key), run **Stem MIDI Cleaner & Pad Mapper** to remove bleed notes, then **Groove Humanizer**.

### B. Drums to MIDI (3 methods)
* **Method 1: Trigger WAVs + Edison (fastest):** take `<drumstem>_Kick_Trigger.wav`, `_Snare_Trigger.wav` and `_Hat_Trigger.wav` from `03_Prepped_Stems/<Track>/Drum_Triggers/`, run each through **Edison > Wrench > Convert to score and dump to piano roll**, merge into your **FPC** channel, then run **FPC Drum Mapper & Humanizer**.
* **Method 2: Slicex groove dump:** load the prepped drum stem into **Slicex**, raise the **auto-slicing threshold** until only main kick/snare/hat hits have markers, dump markers to the Piano Roll, then run **FPC Drum Mapper & Humanizer**.
* **Method 3: MPC Beats sample chop:** open **MPC Beats** as a plugin in FL, drag the drum stem into **Sample Edit**, set Chop Mode to **Threshold (`25–35`)**, then **Shift + Convert > New Drum Program using Slices** with **Create New Track** and **Create Events** on. Reassign note lanes to a real kit and apply **MPC Swing `55–57%`**.

---

## 4. FPC vs. MPC Beats

### Why FPC is the default
* **Up to 16 velocity layers per pad** with a **Random layers** option, avoiding the "machine-gun" repeated-sample effect.
* **Recommended FPC settings** (pad numbers assume the factory GM kit; check your kit's mapping):
  1. **Random layers** on Kick (`Pad 2`), Closed Hat (`Pad 3`), Main Snare (`Pad 5`) and Ghost Snare (`Pad 6`), with velocity ranges overlapping ~10%.
  2. **Cut `1` / By `1`** on Closed Hat (`Pad 3`), Open Hat (`Pad 7`) and Pedal Hat (`Pad 8`) for realistic hi-hat choke.
  3. **Output Offset = `1`** (top right of FPC, FPC on Mixer Track 10) to spread pads across Mixer Tracks 10–16 for individual processing.

### Using MPC Beats alongside FL
* **Free MPC Beats limits:** 2 stereo audio tracks, 8 MIDI tracks, and VST2-only plugin scanning in standalone mode.
* **Practical setup:** keep all audio on the **FL Playlist** and load **MPC Beats as a plugin inside FL** for its threshold chopper, **AIR Bassline / TubeSynth / Electric**, and **AIR Flavor** tape/vinyl colour.

---

## 5. FL Studio piano-roll scripts

Install: copy the `.pyscript` files from `pipeline/scripts/fl_studio/` to `Documents/Image-Line/FL Studio/Settings/Piano roll scripts/`. Run from the scripts list in the Piano Roll **Tools** menu; **Run last script again** (`Ctrl+Alt+Y`) repeats the last-used script.

| File | Dialog title | What it does |
| :--- | :--- | :--- |
| `FPC_Drum_Mapper_Humanizer.pyscript` | **FPC Drum Mapper & Humanizer** | Removes short/quiet bleed notes, maps drum hits to FPC pads (factory GM kit; check your kit's mapping), optional ghost/main snare split, velocity variation across layers, timing pocket and snare lay-back. |
| `Groove_Humanize.pyscript` | **Groove Humanizer** | Gaussian timing and velocity variation, chord strum, optional laid-back backbeat. |
| `Stem_MIDI_Cleaner.pyscript` | **Stem MIDI Cleaner & Pad Mapper** | Deletes ghost/bleed notes below length/velocity thresholds; optionally maps drums to pads (e.g. MPC Beats Bank A). |

Common behaviour:
* **Input mode:** `Auto` (detects the source), `GM drums` (pass-through — notes are already General MIDI drum numbers), or `Pitched transcription` (band map — e.g. low/mid/high notes from a trigger or Edison transcription are mapped to kick/snare/hat).
* **Tick knobs are scaled for the project PPQ**, so the same setting feels the same at any PPQ.
* Scripts act on the **selected notes**, or on **all notes** in the clip if nothing is selected.

---

## 6. Mixer routing (suggested)

| Mixer track | Content |
| :--- | :--- |
| 1–4 | Instrument buses (bass, keys/Scaler parts, leads, Suno ear-candy stems) |
| 5 | Lead vocal (chain in Section 2) |
| 6–9 | Vocal doubles / harmonies / FX returns (Convolver send) |
| 10–16 | FPC pads via Output Offset `1` (kick, snare, hats, etc.) |
| Master | Light bus glue only before QA; master after Gemini fix list is addressed |
