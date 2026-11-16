# Antigravity Setup Handoff

Paste everything in the box below into **Google Antigravity** on your Windows machine. It sets up the pipeline end to end and reports back. Edit the paths at the top first if you don't want the defaults.

```text
You are setting up a music-production helper pipeline on this Windows PC. Work step by step, show each command before running it, and stop to ask me if anything fails or needs admin rights.

SETTINGS (edit if needed)
- Repo: https://github.com/jezehelfranca-svg/Suno-Music-Creator
- Branch: claude/gallant-mendel-t8ei6b
- Clone location: %USERPROFILE%\Code\Suno-Music-Creator
- Pipeline base dir: C:\Music_Pipeline
- FL scripts folder: %USERPROFILE%\Documents\Image-Line\FL Studio\Settings\Piano roll scripts

GUARDRAILS (follow strictly)
- This pipeline is for stem prep, tonal cleanup, drum triggers, MIDI cleanup/humanization and mix QA only.
- Do NOT add or suggest features that remove/alter audio watermarks or provenance data, evade AI-content or voiceprint detection, or present AI-generated audio as human-made. Do not add pitch-shift/phase-rotation "scrubbing" steps.
- Do not edit the repo's source files, commit or push. Only create folders/files outside the repo as listed below.
- Do not store or print secrets, tokens or personal email addresses.

STEPS
1. Prerequisites
   - Check `git --version` and `python --version` (need Python 3.9+). If missing, tell me what to install; don't install silently.
   - Check `ffmpeg -version`. If missing, install with `winget install --id Gyan.FFmpeg -e` (ask me first), then open a new shell and re-check that ffmpeg is on PATH.
2. Get the code
   - git clone the repo to the clone location, then `git checkout claude/gallant-mendel-t8ei6b`.
   - All following commands run from the repo root.
3. Optional dependency (enables event-based --watch; polling works without it)
   - `python -m pip install -r pipeline/scripts/stem_prep/requirements.txt`
4. Create the folder tree under C:\Music_Pipeline (create only what's missing):
   01_Suno_Inbox, 02_Moises_Stems, 03_Prepped_Stems, 04_FL_Project, 05_Mix_Renders, Templates
   Tell me to save my FL Studio starter project as C:\Music_Pipeline\Templates\Project_Template.flp (optional; the tool skips the copy if it's absent).
5. Install FL Studio piano-roll scripts
   - Copy these from pipeline/scripts/fl_studio/ into the FL scripts folder (create it if missing; overwrite older copies):
     FPC_Drum_Mapper_Humanizer.pyscript, Groove_Humanize.pyscript, Stem_MIDI_Cleaner.pyscript
   - Remind me: in FL's Piano Roll open Tools > Scripting to find "FPC Drum Mapper & Humanizer", "Groove Humanizer" and "Stem MIDI Cleaner & Pad Mapper"; Alt+Y re-opens the last-used script.
6. Run the tests
   - `python -m unittest discover -s pipeline/scripts/stem_prep/tests -t pipeline/scripts/stem_prep`
   - `python -m unittest discover -s pipeline/scripts/fl_studio/tests -t pipeline/scripts/fl_studio`
   - Report pass/fail counts. If anything fails, show the error and stop.
7. Dry run the stem prep tool
   - `python pipeline/scripts/stem_prep/stem_prep.py --base-dir C:/Music_Pipeline --dry-run`
   - If 02_Moises_Stems is empty, say so (that's fine). If I have a track folder there, show what it would produce.
8. Start watching (only after I confirm)
   - `python pipeline/scripts/stem_prep/stem_prep.py --base-dir C:/Music_Pipeline --watch --preset gentle`
   - Explain presets: off (copy only), gentle (default), bright-tame (stronger top-end softening). Explain that deleting 03_Prepped_Stems\<Track>\.done re-processes a track.
   - Offer (don't create without asking) a .bat shortcut on my Desktop that runs the --watch command.

VERIFICATION CHECKLIST (report each as PASS / FAIL / SKIPPED with a reason)
[ ] git, python 3.9+, ffmpeg all on PATH
[ ] repo cloned on branch claude/gallant-mendel-t8ei6b
[ ] watchdog installed (or SKIPPED: polling will be used)
[ ] C:\Music_Pipeline has 01_Suno_Inbox, 02_Moises_Stems, 03_Prepped_Stems, 04_FL_Project, 05_Mix_Renders, Templates
[ ] 3 .pyscript files present in the FL Piano roll scripts folder
[ ] stem_prep unit tests pass
[ ] fl_studio unit tests pass
[ ] --dry-run completes without errors
[ ] --watch running (or SKIPPED: not confirmed yet)
Finish with a short summary and the next manual steps: drop a Moises stem folder into 02_Moises_Stems\<Track>\, then follow pipeline/docs/WORKFLOW_GUIDE.md.
```

## Notes

- Commands use `python`; on some Windows installs it is `py` instead.
- Responsible use: disclose AI assistance where your distributor or platform requires it, and check your Suno plan's terms before releasing. See `README.md`.
