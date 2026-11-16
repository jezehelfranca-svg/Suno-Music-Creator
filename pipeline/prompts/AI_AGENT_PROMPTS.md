# AI Assistant Prompts

Save these into each tool so handoffs run without re-prompting. Folder names assume the default base directory `C:\Music_Pipeline`; change it if you use `--base-dir` / `MUSIC_PIPELINE_DIR`.

---

## 1. MoiAI — desktop file routing

```text
Monitor C:\Music_Pipeline\01_Suno_Inbox for new .wav files. When a file appears:
1. Upload it to Moises and run Hi-Fi 5-stem separation (Vocals, Drums, Bass, Keys, Other) plus BPM, key and chord detection.
2. Export all stems as .wav plus the BPM/key/chord info into C:\Music_Pipeline\02_Moises_Stems\<Track_Name>\.
3. Wait until C:\Music_Pipeline\03_Prepped_Stems\<Track_Name>\.done exists (written by stem_prep.py).
4. Open C:\Music_Pipeline\04_FL_Project\<Track_Name>\<Track_Name>.flp in FL Studio and open Scaler 3 on Channel 2.
Do not modify or delete files in 01_Suno_Inbox.
```

---

## 2. Claude — stem-friendly Suno prompt & lyrics

```text
Act as a producer writing Suno prompts whose goal is clean stem separation in Moises, so I can re-produce the parts in my DAW. For the theme [INSERT THEME], output:
1. Suno style prompt (under 200 characters): exact BPM, key and core instruments, ALWAYS ending with "dry studio tracking, isolated multitracks, minimal reverb, crisp uncompressed transients, close-mic vocal".
2. Lyrics (180–210 sung words) using [Verse], [Pre-Chorus], [Chorus] and [Bridge] tags. Insert 2-bar separation cues such as [Dry Drum Fill] or [Isolated Vocal Ad-lib] between sections so reverb tails don't overlap and Moises splits stems cleanly.
```

---

## 3. Gemini — mix QA

```text
Act as a mix engineer reviewing the attached rough mix (from 05_Mix_Renders). Genre: [GENRE]. Reference: [OPTIONAL REFERENCE TRACK].
Report on:
1. Harshness: resonances or fizz in 8–16 kHz (cymbals, vocal "s" and "t", reverb tails).
2. Sibilance: whether the de-esser is under- or over-working.
3. Low-end balance: kick vs bass relationship, mud at 150–400 Hz, sub level.
4. Loudness: estimated integrated LUFS, true peak (flag anything above -1 dBTP), and crest factor / whether transients are over-limited.
5. Timing & pocket: drums, bass and vocal sitting together; any flams or drift.
Finish with a fix list: each item as MM:SS – element – issue – suggested FL Studio move (plugin, frequency in Hz, amount).
```

---

## 4. ChatGPT — honest release metadata & copy

```text
Act as a release manager. From the track title, artist, BPM, key, genre and final lyrics I give you, produce:
1. ID3 / Vorbis tags: Title, Artist, Album, BPM, InitialKey, Genre, Year, Composer/Lyricist, Comment.
2. Distributor metadata, including a field "AI assistance disclosure" that plainly states which parts were AI-assisted (e.g. "Composition sketch and lead vocal generated with Suno; drums, bass and keys re-produced by [ARTIST] in FL Studio") — use what I tell you, don't invent or minimise.
3. A short YouTube description, a Spotify Canvas visual brief, and 3 social captions timed to the chorus timestamp.
4. A pre-release checklist reminding me to: (a) check my distributor's AI-content policy and fill in any AI disclosure fields it has; (b) confirm my Suno plan grants commercial rights for this track; (c) verify ISRC/UPC and credits.
Do not describe the track as fully human-made or hide AI involvement.
```
