# Complete Suno-to-Human Production & Routing Guide

## 1. The 6-Stage "Zero-Fingerprint" Production Workflow

### Stage 1: Automated Prompting & Clean Suno Generation (Claude + Suno)
* Have **Claude** generate your lyrics and style prompt, specifically instructing Suno to avoid baked-in stereo reverb or mud.
* **Mandatory Style Suffix:** Always append `dry studio recording, isolated stems, tight transients, minimal reverb, uncompressed studio mix` to your Suno style prompt.
* Download the full WAV mix into `C:/Music_Pipeline/01_Suno_Inbox`.

### Stage 2: Hands-Free Stem Separation & Spectral Scrubbing (MoiAI + Antigravity 2.0 + Moises)
* **Moises Extraction:** MoiAI routes the WAV through **Moises** to split into 5–6 stems (`Vocals`, `Drums`, `Bass`, `Keys/Guitar`, `Other`) and extracts exact **BPM, Key, and Chord Map**.
* **Watermark & Artifact Scrubbing (`suno_scrubber_daemon.py`):**
  * Applies a **-5 cent micro-pitch shift with tempo restoration** (`asetrate=48000*0.9971` + `atempo=1.002908`) and an **all-pass phase rotation** at `1400 Hz` to break frame-locked spectral watermarks without changing the song's key or timing.
  * Applies a steep **16.2 kHz low-pass roll-off** on vocals and **13.5 kHz low-pass roll-off** on non-vocal stems to eliminate Suno's upper-frequency metallic hiss.
  * Automatically splits `Drums.wav` into three frequency-gated trigger WAVs (`Kick_Trigger.wav`, `Snare_Trigger.wav`, `Hat_Trigger.wav`) for instant MIDI extraction.

### Stage 3: Harmonic Reconstruction & Multi-Lane MIDI Replacement (Scaler 3.1)
* Load the Moises-extracted `Keys/Other` and `Bass` stems into **Scaler 3.1** using **Audio Detection**.
* **Auto Voice Leading & Colors:** Select the detected chords on the Arrange Page and click **Auto Voice Leading** so inversions flow smoothly from the first chord. Swap in 7th/9th voicings from the **Colors** menu.
* **Bass Follow + Scissor Tool:** Add a **Bass Follow** track in Scaler 3.1, slice rhythmic variations using the **Scissor Tool**, and route or drag the MIDI clip to your bass VST.
* **Melody Motion & Call-and-Response Muting:** Add a **Melody Motion** lane set to **Scale Mode** (switching the final turnaround bar back to **Chord Mode** with the Scissor Tool). Split the melody every bar and `Shift + Click` to mute bars where the lead vocal is singing.
* **Live Sync Routing in FL Studio:** Enable **Live Sync Lead** on your main Scaler 3.1 chord instance (via the 3-dot menu). Any additional Scaler 3.1 instances automatically join as **Live Sync Followers**, inheriting chord changes in real time.

### Stage 4: Groove Injection & Drum Replacement (FL Studio FPC vs. MPC 3 Beats)
* Mute and discard the original Suno drum audio stem.
* Convert the drum groove to MIDI (via **Edison**, **Slicex**, free **TONIQ**, or **MPC Beats Sample Chop**) and trigger multi-velocity acoustic/electronic kits inside **FL Studio FPC** (recommended) or **MPC 3 Beats**.

### Stage 5: Vocal Resynthesis & Micro-Humanization (FL Studio)
* Process `Vocals_scrubbed.wav` through the **De-Suno Vocal Mixer Chain** (Section 2 below).
* Layer a subtle real vocal double, whisper track, or formant-shifted harmony underneath at `-9 dB`.
* Run `FPC_Moises_Humanizer.pyscript` (`Alt+Y`) on your drum MIDI and `Gaussian_Humanize.pyscript` (`Alt+Y`) on all Scaler 3 / melodic MIDI channels.

### Stage 6: Multimodal Audio QA & Master Render (Gemini + FL Studio)
* Export a 24-bit WAV mix into `C:/Music_Pipeline/04_QA_Render` and pass it to **Gemini** to verify no 10–18 kHz metallic shimmer remains and confirm natural dynamic crest factor (`-10` to `-12 LUFS` pre-limiting).

---

## 2. The FL Studio "De-Suno" Vocal Mixer Chain (Mixer Track 5)

| Mixer Slot | FL Studio Native Plugin | Exact Parameter Recipe | Acoustic Purpose |
| :--- | :--- | :--- | :--- |
| **Slot 1** | **Fruity Parametric EQ 2** *(Surgical Cleanup)* | • **Band 1 (High-Pass):** Steep 8, `95 Hz`<br>• **Band 4 (Peaking Notch):** `-4.2 dB` at `4650 Hz` (`Q = 4.0`)<br>• **Band 6 (Peaking Notch):** `-3.0 dB` at `7800 Hz` (`Q = 3.5`)<br>• **Band 7 (Low-Pass):** Gentle 4, `16,000 Hz` | Carves out neural vocoder resonance peaks and rolls off upper-frequency phase smear. |
| **Slot 2** | **Maximus** *(De-Esser & Gate)* | • **Low Band (`180–350 Hz`):** Upward compression `+1.5 dB` for chest weight<br>• **Mid Band:** Gate threshold at `-42 dB` to mute watery Moises bleed between phrases<br>• **High Band (`5.5 kHz+`):** `0.5 ms` attack, `-4.5 dB` ceiling | Eliminates Moises separation noise floor between lines and clamps synthetic sibilance. |
| **Slot 3** | **Fruity Waveshaper / Blood Overdrive** | • **Pre-Band:** `0.15` Drive, Mix knob at `18%` | Synthesizes genuine odd/even analog harmonics above `12 kHz` to replace the rolled-off AI top end. |
| **Slot 4** | **Pitcher / NewTone** | • **Formant Shift:** `+0.2` or `-0.2` semitones; Humanize speed: `Medium` | Shifts vocal tract formants so voiceprint matching cannot link to default Suno vocal seeds. |
| **Slot 5** | **Fruity Convolver** *(Send Track)* | • Load a **Small Wood Studio Room IR** (`Pre-delay: 18 ms`, `Wet: 14%`, High-cut at `6 kHz`) | Places the dry vocal inside a unified physical space alongside your VST instruments and FPC drums. |

---

## 3. Exact Stem-to-MIDI Conversion in FL Studio

### A. Pitched Melodies & Basslines
1. **Lock Project BPM First:** Set FL Studio to the exact BPM detected by Moises and set audio clips to **Stretch** mode.
2. **Monophonic Bass & Hooks (NewTone):** Drag `Bass_scrubbed.wav` or a monophonic lead stem into **NewTone**, lower **Variation** to `20%`, and click **Send to piano roll**.
3. **Polyphonic Riffs (Edison or Free TONIQ):**
   * *Edison:* Load `Other_scrubbed.wav` into **Edison**, highlight the riff, and click **Wrench -> Convert to score and dump to piano roll**.
   * *Free TONIQ Plugin:* Load the isolated Moises stem into **TONIQ** (Polyphonic or Melodic mode) and drag the MIDI directly into FL Studio's Channel Rack (bypasses TONIQ Pro's paid Full-Mix and in-plugin editor restrictions).
4. **Scale Lock:** In the FL Studio Piano Roll, enable **Snap to Scale** matching your Scaler 3.1 key and run `Gaussian_Humanize.pyscript`.

### B. Drums to MIDI (3 Methods)
* **Method 1: Antigravity Auto-Triggers + Edison (Fastest in FL Studio):**
  `suno_scrubber_daemon.py` automatically outputs `Kick_Trigger.wav`, `Snare_Trigger.wav`, and `Hat_Trigger.wav`. Drop each into **Edison -> Wrench -> Convert to score and dump to piano roll**, merge into your **FPC** channel, and press `Alt+Y` to run `FPC_Moises_Humanizer.pyscript`.
* **Method 2: Slicex Groove Dump:**
  Load `Drums_scrubbed.wav` into **Slicex**, adjust the **Auto-slicing Threshold** slider until only primary Kick/Snare/Hat transients have markers, dump markers to the Piano Roll, and run `FPC_Moises_Humanizer.pyscript`.
* **Method 3: MPC 3 Beats Sampler Chop (Uses 0 Audio Tracks):**
  Open **MPC Beats VST** inside FL Studio, drag `Drums_scrubbed.wav` into **Sample Edit**, switch Chop Mode to **Threshold (`25–35`)**, press **Shift + Convert -> New Drum Program using Slices** with **Create New Track = ON** and **Create Events = ON**. Reassign the MIDI note lanes to a real drum kit and apply **MPC Swing (`55%–57%`)**.

---

## 4. FPC vs. Free MPC 3 Beats: Configuration & Workarounds

### Why FL Studio FPC Wins for Hands-Free Drum Humanization
* **16 Velocity Layers per Pad:** FPC supports up to 16 velocity sample layers per pad with a one-click **Random layers** toggle, preventing the "machine-gun" effect.
* **3 Mandatory FPC Checkboxes:**
  1. Enable **Random layers** on Kick (`Pad 2`), Closed Hat (`Pad 3`), Main Snare (`Pad 5`), and Ghost Snare (`Pad 6`), overlapping velocity bars by ~10%.
  2. Set **Cut `1` / By `1`** on Closed Hat (`Pad 3`), Open Hat (`Pad 7`), and Pedal Hat (`Pad 8`) for authentic hi-hat stand choking.
  3. Set **Output Offset = `1`** in the top-right corner of FPC (on Mixer Track 10) to automatically fan out individual drum pads across Mixer Tracks 10–16.

### Working Around Free MPC 3 Beats Limits (If Used)
* **Hard Limits in Free MPC Beats:** Max **2 stereo audio tracks**, max **8 MIDI tracks**, and **VST2-only (`.dll`)** plugin scanning in standalone mode.
* **Bypass:** Host all audio stems on the **FL Studio Playlist** and load **MPC Beats as a VST inside FL Studio** solely for its Sampler Threshold-to-MIDI chopper, **AIR Bassline / TubeSynth / Electric**, and **AIR Flavor** tape/vinyl saturation.
* **Bonus Workaround for Unlicensed FL Studio Trial Users:** While FL Studio Trial blocks reopening saved `.flp` files, **MPC Beats saves and reopens `.xpj` projects for free forever**. You can save your entire drum + Scaler 3 + synth arrangement inside an MPC Beats `.xpj` file, load it into a fresh FL Studio session in 3 seconds, and export your master WAV.
