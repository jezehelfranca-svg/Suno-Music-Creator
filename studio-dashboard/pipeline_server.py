#!/usr/bin/env python3
"""Suno Music Pipeline Studio Dashboard & Automation Server.

Unified, zero-external-dependency multi-threaded HTTP server providing:
- Clean handover from standalone CLI watcher daemon to unified server daemon.
- Thread-safe background watcher loop for 6-stage music production automation.
- REST API for live pipeline status, telemetry, track metadata, and actions.
- HTTP 206 Partial Content audio streaming for smooth HTML5 browser audition.
- Safe process launching for FL Studio 2024 (FL64.exe) and Windows Explorer.
- Single-page Dark DAW Studio Web UI.
"""

from __future__ import annotations

import argparse
import atexit
import base64
import ctypes
import glob
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
import urllib.parse

# Ensure local automation directory is on sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import pipeline_automator

# --------------------------------------------------------------------------
# Configuration & Constants
# --------------------------------------------------------------------------

DEFAULT_BASE_DIR = "C:/Music_Pipeline"
ENV_BASE_DIR = "MUSIC_PIPELINE_DIR"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
FL64_EXE = r"C:\Program Files (x86)\Image-Line\FL Studio 2024\FL64.exe"


def _resolve_rendered_dir() -> Path:
    """Resolve FL Studio Rendered audio directory portably."""
    env_dir = os.environ.get("FL_RENDERED_DIR", "").strip()
    if env_dir:
        return Path(env_dir).expanduser()

    onedrive_dir = Path.home() / "OneDrive" / "Documents" / "Image-Line" / "FL Studio" / "Audio" / "Rendered"
    if onedrive_dir.exists():
        return onedrive_dir

    return Path.home() / "Documents" / "Image-Line" / "FL Studio" / "Audio" / "Rendered"


RENDERED_DIR = _resolve_rendered_dir()

ALLOWED_UPLOAD_EXTENSIONS = {".wav", ".mp3", ".flac", ".m4a", ".ogg"}
MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB
INBOX_STEM_PATTERN = re.compile(r"^(.+)_(vocals|drums|bass|instruments|other|keys)$", re.IGNORECASE)

log = logging.getLogger("pipeline_server")

# --------------------------------------------------------------------------
# Global Mutex & Server State
# --------------------------------------------------------------------------

PROCESSING_LOCK = threading.Lock()
IS_BUSY: bool = False
CURRENT_TASK: str = "Idle"
WATCHER_ENABLED: bool = True
ACTIVE_PRESET: str = "gentle"
POLL_INTERVAL: float = 2.0


def set_activity(busy: bool, task: str) -> None:
    """Thread-safe update of server activity state."""
    global IS_BUSY, CURRENT_TASK
    IS_BUSY = busy
    CURRENT_TASK = task


# --------------------------------------------------------------------------
# Path Sandboxing & Process Helpers
# --------------------------------------------------------------------------

def is_safe_path(base_dir: Path, requested_path: str | Path) -> Tuple[bool, Optional[Path]]:
    """Verify that requested_path canonicalizes strictly within base_dir."""
    try:
        base_real = Path(base_dir).resolve()
        req_str = str(requested_path).strip()
        if not req_str:
            return True, base_real
        req_p = Path(req_str)
        if req_p.is_absolute():
            target_real = req_p.resolve()
        else:
            target_real = (base_real / req_p).resolve()

        common = Path(os.path.commonpath([str(base_real), str(target_real)]))
        if common == base_real:
            return True, target_real
        return False, None
    except Exception:
        return False, None


def sanitize_track_name(name: str) -> str:
    """Sanitize arbitrary stem set title into a clean directory/file identifier."""
    s = re.sub(r"\.wav$", "", name, flags=re.IGNORECASE)
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s)
    s = s.strip("_")
    return s or "Track"


def is_pid_running(pid: int) -> bool:
    """Check if process PID is running on Windows without external dependencies."""
    if pid <= 0:
        return False
    try:
        if os.name == "nt":
            kernel32 = ctypes.windll.kernel32
            handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
            if handle:
                kernel32.CloseHandle(handle)
                return True
            return False
        else:
            os.kill(pid, 0)
            return True
    except Exception:
        return False


def terminate_process_tree(pid: int) -> None:
    """Cleanly terminate a process tree by PID."""
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, check=False)
        else:
            os.kill(pid, signal.SIGTERM)
        time.sleep(0.5)
    except Exception as exc:
        log.warning("Could not terminate process %d: %s", pid, exc)


def handle_watcher_pid_handover(paths: pipeline_automator.PipelinePaths) -> None:
    """Terminate previous standalone watcher process and claim PID ownership."""
    current_pid = os.getpid()
    pid_file = paths.pid_file
    server_pid_file = paths.automation / ".server.pid"

    if pid_file.is_file():
        try:
            content = pid_file.read_text(encoding="utf-8").strip()
            if content:
                old_pid = int(content)
                if old_pid != current_pid and is_pid_running(old_pid):
                    log.info(
                        "Detected existing standalone watcher process PID %d; terminating for clean handover...",
                        old_pid,
                    )
                    terminate_process_tree(old_pid)
        except Exception as exc:
            log.warning("Error inspecting old watcher PID file %s: %s", pid_file, exc)

    # Write current unified server PID
    pid_file.write_text(str(current_pid), encoding="utf-8")
    server_pid_file.write_text(str(current_pid), encoding="utf-8")
    log.info("Server & Watcher unified PID %d claimed -> %s", current_pid, pid_file)


def cleanup_pids(paths: pipeline_automator.PipelinePaths) -> None:
    """Remove PID files on server shutdown if they match our process."""
    current_pid = os.getpid()
    for p in (paths.pid_file, paths.automation / ".server.pid"):
        try:
            if p.is_file() and p.read_text(encoding="utf-8").strip() == str(current_pid):
                p.unlink(missing_ok=True)
                log.info("Removed PID file %s", p)
        except Exception:
            pass


# --------------------------------------------------------------------------
# Mix QA Markdown Parser
# --------------------------------------------------------------------------

def parse_mix_qa_report(report_path: Path) -> Dict[str, Any]:
    """Parse Mix QA Markdown report into structured telemetry."""
    if not report_path.is_file():
        return {}
    content = report_path.read_text(encoding="utf-8", errors="replace")
    data: Dict[str, Any] = {
        "raw_markdown": content,
        "integrated_lufs": None,
        "true_peak_dbtp": None,
        "crest_factor_db": None,
        "lra_lu": None,
        "peak_dbfs": None,
        "rms_dbfs": None,
        "bands": [],
        "fixes": [],
    }

    # Extract metrics from overview table
    m = re.search(r"Integrated Loudness\s*\*\*\s*\|\s*\*\*([-\d\.]+)\s*LUFS", content)
    if m:
        data["integrated_lufs"] = float(m.group(1))

    m = re.search(r"True Peak\s*\*\*\s*\|\s*\*\*([-\d\.]+)\s*dBTP", content)
    if m:
        data["true_peak_dbtp"] = float(m.group(1))

    m = re.search(r"Crest Factor\s*\*\*\s*\|\s*\*\*([-\d\.]+)\s*dB", content)
    if m:
        data["crest_factor_db"] = float(m.group(1))

    m = re.search(r"Loudness Range \(LRA\)\s*\*\*\s*\|\s*\*\*([-\d\.]+)\s*LU", content)
    if m:
        data["lra_lu"] = float(m.group(1))

    m = re.search(r"Peak Amplitude\s*\*\*\s*\|\s*\*\*([-\d\.]+)\s*dBFS", content)
    if m:
        data["peak_dbfs"] = float(m.group(1))

    m = re.search(r"RMS Level\s*\*\*\s*\|\s*\*\*([-\d\.]+)\s*dBFS", content)
    if m:
        data["rms_dbfs"] = float(m.group(1))

    # Extract 5 Bands
    for title, body in re.findall(r"### (Band \d+: [^\n]+)\n(.*?)(?=\n###|\n##|$)", content, re.DOTALL):
        st = re.search(r"-\s*\*\*Status\*\*:\s*([^\n]+)", body)
        hotspot = re.search(r"at \*\*([0-9:]+)\*\*", body)
        lines = [l.strip().lstrip("-* \t") for l in body.strip().splitlines() if l.strip()]
        data["bands"].append({
            "title": title.strip(),
            "status": st.group(1).strip() if st else "OK",
            "hotspot": hotspot.group(1).strip() if hotspot else None,
            "details": lines,
        })

    # Extract Actionable Fixes
    fix_sec = re.search(r"## 3\. Recommended Actionable Fix List\s*\n+(.*?)(?=\n##|$)", content, re.DOTALL)
    if fix_sec:
        for line in fix_sec.group(1).strip().splitlines():
            line = line.strip().lstrip("-* \t")
            if not line:
                continue
            parts = re.split(r"\s+[–—]\s+|\s+-\s+", line, maxsplit=3)
            if len(parts) >= 4:
                data["fixes"].append({
                    "timestamp": parts[0].strip(),
                    "element": parts[1].strip(),
                    "issue": parts[2].strip(),
                    "move": parts[3].strip(),
                })
            else:
                data["fixes"].append({
                    "timestamp": "",
                    "element": "Mix",
                    "issue": "",
                    "move": line,
                })

    return data


# --------------------------------------------------------------------------
# Pipeline Telemetry & Data Discovery
# --------------------------------------------------------------------------

def has_pending_work(paths: pipeline_automator.PipelinePaths) -> Optional[str]:
    """Check if any pipeline stage has pending work to process.

    Returns task description if work is pending, or None if idle.
    """
    # 1. 01_Suno_Inbox: unrouted .wav files
    if paths.inbox.exists():
        wav_files = [p for p in paths.inbox.glob("*.wav") if not p.name.startswith(".")]
        if wav_files:
            for wav in wav_files:
                match = INBOX_STEM_PATTERN.match(wav.stem)
                if match:
                    track_name = match.group(1).strip()
                    dest = paths.stems / track_name / wav.name
                    if not dest.exists() or dest.stat().st_size != wav.stat().st_size:
                        return "Processing 01_Suno_Inbox..."
                else:
                    track_name = wav.stem
                    dest_dir = paths.stems / track_name
                    if not dest_dir.exists() or not any(not p.name.startswith(".") for p in dest_dir.glob("*.wav")):
                        return "Processing 01_Suno_Inbox..."

    # 2. 02_Moises_Stems: tracks with .wav files lacking 03_Prepped_Stems/<Track>/.done
    if paths.stems.exists():
        for d in paths.stems.iterdir():
            if d.is_dir() and not d.name.startswith("."):
                done_marker = paths.prepped / d.name / ".done"
                if not done_marker.exists() and any(not p.name.startswith(".") for p in d.glob("*.wav")):
                    return "Running Stem Prep..."

    # 3. 03_Prepped_Stems: tracks with .done lacking MIDI/.midi_done
    if paths.prepped.exists():
        for d in paths.prepped.iterdir():
            if d.is_dir() and not d.name.startswith("."):
                done_marker = d / ".done"
                midi_done = d / "MIDI" / ".midi_done"
                if done_marker.exists() and not midi_done.exists():
                    return "Generating MIDI & Metadata..."

    # 4. 05_Mix_Renders: renders lacking <stem>_Mix_QA_Report.md
    if paths.renders.exists():
        for wav in paths.renders.glob("*.wav"):
            if not wav.name.startswith("."):
                report = paths.renders / f"{wav.stem}_Mix_QA_Report.md"
                if not report.exists():
                    return "Running Mix QA Analysis..."

    # 5. 03_Prepped_Stems: prepped tracks lacking Mix QA report in 05_Mix_Renders
    if paths.prepped.exists():
        for d in sorted(paths.prepped.iterdir()):
            if d.is_dir() and not d.name.startswith("."):
                if (d / ".done").exists() and (d / "Audio_Stems").is_dir() and any(
                    not p.name.startswith(".") for p in (d / "Audio_Stems").glob("*.wav")
                ):
                    qa_reports = (
                        list(paths.renders.glob(f"{glob.escape(d.name)}*_Mix_QA_Report.md"))
                        if paths.renders.exists()
                        else []
                    )
                    if not qa_reports:
                        return f"Generating Rough Mix & QA for {d.name}..."

    return None


def get_pipeline_counts(paths: pipeline_automator.PipelinePaths) -> Dict[str, int]:
    """Compute live entity counts across the 6 pipeline stages."""
    inbox_cnt = len([p for p in paths.inbox.glob("*.wav") if not p.name.startswith(".")]) if paths.inbox.exists() else 0
    moises_cnt = len([p for p in paths.stems.iterdir() if p.is_dir() and not p.name.startswith(".")]) if paths.stems.exists() else 0
    prepped_cnt = len([p for p in paths.prepped.iterdir() if p.is_dir() and (p / ".done").exists()]) if paths.prepped.exists() else 0
    fl_cnt = len(list(paths.fl_project.glob("*/*.flp"))) if paths.fl_project.exists() else 0
    renders_cnt = len([p for p in paths.renders.glob("*.wav") if not p.name.startswith(".")]) if paths.renders.exists() else 0

    avail_sets = 0
    if RENDERED_DIR.exists():
        try:
            files = os.listdir(RENDERED_DIR)
            pat = re.compile(r"^(.*)_(bass|drums|instruments|vocals)\.wav$", re.IGNORECASE)
            groups: Dict[str, set] = {}
            for f in files:
                m = pat.match(f)
                if m:
                    groups.setdefault(m.group(1), set()).add(m.group(2).lower())
            avail_sets = sum(1 for stems in groups.values() if len(stems) == 4)
        except Exception:
            pass

    return {
        "inbox": inbox_cnt,
        "moises_stems": moises_cnt,
        "prepped_tracks": prepped_cnt,
        "fl_projects": fl_cnt,
        "mix_renders": renders_cnt,
        "available_rendered_sets": avail_sets,
    }


def get_recent_logs(log_file: Path, max_lines: int = 60) -> List[str]:
    """Retrieve the most recent log lines from pipeline.log."""
    if not log_file.is_file():
        return []
    try:
        with open(log_file, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
            return [line.rstrip("\r\n") for line in lines[-max_lines:]]
    except Exception as exc:
        return [f"[ERROR] Could not read log file: {exc}"]


def discover_tracks(paths: pipeline_automator.PipelinePaths) -> Dict[str, Any]:
    """Discover all tracks across stages, metadata, stems, triggers, MIDI, and renders."""
    track_names = set()
    if paths.inbox.exists():
        for f in paths.inbox.glob("*.wav"):
            if f.name.startswith("."):
                continue
            m = INBOX_STEM_PATTERN.match(f.stem)
            t_name = m.group(1).strip() if m else f.stem
            if t_name:
                track_names.add(t_name)
    if paths.stems.exists():
        for d in paths.stems.iterdir():
            if d.is_dir() and not d.name.startswith("."):
                track_names.add(d.name)
    if paths.prepped.exists():
        for d in paths.prepped.iterdir():
            if d.is_dir() and not d.name.startswith("."):
                track_names.add(d.name)
    if paths.fl_project.exists():
        for d in paths.fl_project.iterdir():
            if d.is_dir() and not d.name.startswith("."):
                track_names.add(d.name)
    if paths.renders.exists():
        for f in paths.renders.glob("*.wav"):
            if f.name.startswith("."):
                continue
            name = re.sub(r"(_RoughMix|_Mix|_Master)$", "", f.stem, flags=re.IGNORECASE)
            if name:
                track_names.add(name)

    tracks_list = []
    base = paths.base

    for name in sorted(track_names):
        track_info: Dict[str, Any] = {
            "name": name,
            "status": "Splitting Stems (Demucs)...",
            "metadata": {},
            "source_stems": [],
            "prepped_stems": [],
            "drum_triggers": [],
            "midi_files": [],
            "fl_project": {"exists": False, "rel_path": "", "abs_path": "", "size_mb": 0.0},
            "mix_qa": None,
        }

        # 1. Source stems in 02_Moises_Stems
        src_dir = paths.stems / name
        if src_dir.is_dir():
            for f in sorted(src_dir.glob("*.wav")):
                if f.name.startswith("."):
                    continue
                track_info["source_stems"].append({
                    "name": f.name,
                    "rel_path": str(f.relative_to(base)).replace("\\", "/"),
                    "size_mb": round(f.stat().st_size / 1048576, 2),
                })

        # 2. Prepped stems & triggers & MIDI & metadata in 03_Prepped_Stems
        prep_dir = paths.prepped / name
        if prep_dir.is_dir():
            meta_path = prep_dir / "track_metadata.json"
            if meta_path.is_file():
                try:
                    track_info["metadata"] = json.loads(meta_path.read_text(encoding="utf-8"))
                except Exception:
                    pass

            audio_stems_dir = prep_dir / "Audio_Stems"
            if audio_stems_dir.is_dir():
                for f in sorted(audio_stems_dir.glob("*.wav")):
                    kind = "other"
                    for k, kw_list in pipeline_automator.STEM_KEYWORDS:
                        if any(kw in f.name.lower() for kw in kw_list):
                            kind = k
                            break
                    track_info["prepped_stems"].append({
                        "name": f.name,
                        "kind": kind,
                        "rel_path": str(f.relative_to(base)).replace("\\", "/"),
                        "size_mb": round(f.stat().st_size / 1048576, 2),
                    })

            triggers_dir = prep_dir / "Drum_Triggers"
            if triggers_dir.is_dir():
                for f in sorted(triggers_dir.glob("*.wav")):
                    band = "Perc"
                    if "kick" in f.name.lower():
                        band = "Kick"
                    elif "snare" in f.name.lower():
                        band = "Snare"
                    elif "hat" in f.name.lower():
                        band = "Hat"
                    track_info["drum_triggers"].append({
                        "name": f.name,
                        "band": band,
                        "rel_path": str(f.relative_to(base)).replace("\\", "/"),
                        "size_mb": round(f.stat().st_size / 1048576, 2),
                    })

            midi_dir = prep_dir / "MIDI"
            if midi_dir.is_dir():
                for f in sorted(midi_dir.glob("*.mid")):
                    role = "MIDI"
                    if "drums" in f.name.lower() or "fpc" in f.name.lower():
                        role = "FPC Drums"
                    elif "bass" in f.name.lower():
                        role = "Bass"
                    track_info["midi_files"].append({
                        "name": f.name,
                        "role": role,
                        "rel_path": str(f.relative_to(base)).replace("\\", "/"),
                        "size_kb": round(f.stat().st_size / 1024, 1),
                    })

        # 3. FL Studio Project
        flp_path = paths.fl_project / name / f"{name}.flp"
        if flp_path.is_file():
            track_info["fl_project"] = {
                "exists": True,
                "rel_path": str(flp_path.relative_to(base)).replace("\\", "/"),
                "abs_path": str(flp_path),
                "size_mb": round(flp_path.stat().st_size / 1048576, 2),
            }

        # 4. Mix QA Report & Audio
        escaped_name = glob.escape(name)
        qa_reports = list(paths.renders.glob(f"{escaped_name}*_Mix_QA_Report.md")) if paths.renders.exists() else []
        if qa_reports:
            parsed_qa = parse_mix_qa_report(qa_reports[0])
            render_wavs = [f for f in paths.renders.glob(f"{escaped_name}*.wav") if not f.name.startswith(".")]
            if render_wavs:
                parsed_qa["audio_rel_path"] = str(render_wavs[0].relative_to(base)).replace("\\", "/")
            else:
                parsed_qa["audio_rel_path"] = None
            track_info["mix_qa"] = parsed_qa

        # 5. Status determination
        if track_info["mix_qa"] is not None:
            track_info["status"] = "Mix Rendered & Audited"
        elif (prep_dir / "MIDI" / ".midi_done").exists():
            track_info["status"] = "Prepped & Ready"
        elif (prep_dir / ".done").exists():
            track_info["status"] = "Generating MIDI..."
        elif src_dir.is_dir() and any(not p.name.startswith(".") for p in src_dir.glob("*.wav")):
            track_info["status"] = "Prepping Stems..."
        else:
            track_info["status"] = "Splitting Stems (Demucs)..."

        tracks_list.append(track_info)

    # Discovered Available Rendered sets
    available_rendered = []
    if RENDERED_DIR.exists():
        try:
            files = os.listdir(RENDERED_DIR)
            pat = re.compile(r"^(.*)_(bass|drums|instruments|vocals)\.wav$", re.IGNORECASE)
            groups: Dict[str, Dict[str, str]] = {}
            for f in files:
                m = pat.match(f)
                if m:
                    base_n, kind = m.group(1), m.group(2).lower()
                    groups.setdefault(base_n, {})[kind] = f

            for base_n, stems in sorted(groups.items()):
                clean_id = sanitize_track_name(base_n)
                is_imported = (paths.stems / clean_id).exists() or (paths.prepped / clean_id).exists()
                available_rendered.append({
                    "track_name": base_n,
                    "clean_id": clean_id,
                    "stem_count": len(stems),
                    "stems": sorted(list(stems.keys())),
                    "already_imported": is_imported,
                })
        except Exception as exc:
            log.warning("Could not list RENDERED_DIR: %s", exc)

    # Inbox files
    inbox_files = []
    if paths.inbox.exists():
        for f in sorted(paths.inbox.glob("*.wav")):
            if f.name.startswith("."):
                continue
            inbox_files.append({
                "name": f.name,
                "size_mb": round(f.stat().st_size / 1048576, 2),
                "rel_path": str(f.relative_to(base)).replace("\\", "/"),
            })

    return {
        "tracks": tracks_list,
        "available_rendered": available_rendered,
        "inbox_files": inbox_files,
    }


# --------------------------------------------------------------------------
# Pipeline Action Helpers
# --------------------------------------------------------------------------

def generate_rough_mix_wav(
    paths: pipeline_automator.PipelinePaths,
    track_name: str,
    ffmpeg_bin: str = "ffmpeg",
) -> Tuple[bool, str]:
    """Mix prepped stems using ffmpeg amix into 05_Mix_Renders and run Mix QA."""
    prep_audio_dir = paths.prepped / track_name / "Audio_Stems"
    if not prep_audio_dir.exists():
        return False, f"Directory not found: {prep_audio_dir}"

    stems = sorted(list(prep_audio_dir.glob("*.wav")))
    if not stems:
        return False, f"No prepped WAV stems found in {prep_audio_dir}"

    paths.renders.mkdir(parents=True, exist_ok=True)
    out_wav = paths.renders / f"{track_name}_RoughMix.wav"

    cmd = [ffmpeg_bin, "-y"]
    for s in stems:
        cmd.extend(["-i", str(s)])
    cmd.extend([
        "-filter_complex", f"amix=inputs={len(stems)}:duration=longest:dropout_transition=0:normalize=0",
        "-c:a", "pcm_s24le",
        str(out_wav),
    ])

    log.info("[%s] Generating rough mix via ffmpeg...", track_name)
    res = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if res.returncode != 0:
        log.error("[%s] ffmpeg rough mix failed: %s", track_name, res.stderr)
        return False, f"ffmpeg mix failed: {res.stderr}"

    log.info("[%s] Rough mix generated -> %s. Running Mix QA...", track_name, out_wav)
    qa = pipeline_automator.MixQAReport(out_wav, ffmpeg_bin=ffmpeg_bin)
    md_content = qa.generate_report()
    report_path = paths.renders / f"{out_wav.stem}_Mix_QA_Report.md"
    pipeline_automator.atomic_write_text(report_path, md_content)
    log.info("[%s] Mix QA report written -> %s", track_name, report_path)

    return True, str(out_wav)


def import_rendered_track(
    base_name: str,
    paths: pipeline_automator.PipelinePaths,
    preset: str = "gentle",
    ffmpeg_bin: str = "ffmpeg",
) -> Tuple[bool, str]:
    """Import 4-stem set from FL Rendered folder, auto-prep stems, MIDI, and rough mix QA."""
    if not RENDERED_DIR.exists():
        return False, f"FL Rendered directory does not exist: {RENDERED_DIR}"

    files = os.listdir(RENDERED_DIR)
    pat = re.compile(r"^(.*)_(bass|drums|instruments|vocals)\.wav$", re.IGNORECASE)
    matching_stems: Dict[str, str] = {}
    for f in files:
        m = pat.match(f)
        if m and m.group(1) == base_name:
            matching_stems[m.group(2).lower()] = f

    if not matching_stems:
        return False, f"No matching stems found for base name '{base_name}'"

    clean_id = sanitize_track_name(base_name)
    target_moises = paths.stems / clean_id
    target_moises.mkdir(parents=True, exist_ok=True)

    for kind, filename in matching_stems.items():
        src = RENDERED_DIR / filename
        dst = target_moises / filename
        shutil.copy2(src, dst)
        log.info("[%s] Imported stem %s -> %s", clean_id, filename, dst)

    # Invalidate done markers so stem prep runs cleanly
    prep_dir = paths.prepped / clean_id
    if (prep_dir / ".done").exists():
        (prep_dir / ".done").unlink(missing_ok=True)
    if (prep_dir / "MIDI" / ".midi_done").exists():
        (prep_dir / "MIDI" / ".midi_done").unlink(missing_ok=True)

    # 1. Stem prep
    log.info("[%s] Running stem prep with preset '%s'...", clean_id, preset)
    pipeline_automator.run_stem_prep(paths, preset=preset)

    # 2. MIDI & Metadata
    log.info("[%s] Generating MIDI & metadata...", clean_id)
    pipeline_automator.generate_midi_and_metadata(paths, preset=preset)

    # 3. Rough Mix & QA Report
    log.info("[%s] Generating Rough Mix & QA report...", clean_id)
    generate_rough_mix_wav(paths, clean_id, ffmpeg_bin=ffmpeg_bin)

    return True, clean_id


def backfill_rough_mixes(
    paths: pipeline_automator.PipelinePaths,
    ffmpeg_bin: str = "ffmpeg",
) -> None:
    """Generate Rough Mix WAV and Mix QA report for prepped tracks lacking a QA report."""
    if not paths.prepped.exists():
        return
    for d in sorted(paths.prepped.iterdir()):
        if d.is_dir() and not d.name.startswith("."):
            audio_stems_dir = d / "Audio_Stems"
            if (d / ".done").exists() and audio_stems_dir.is_dir() and any(
                not p.name.startswith(".") for p in audio_stems_dir.glob("*.wav")
            ):
                qa_reports = (
                    list(paths.renders.glob(f"{glob.escape(d.name)}*_Mix_QA_Report.md"))
                    if paths.renders.exists()
                    else []
                )
                if not qa_reports:
                    set_activity(True, f"Generating Rough Mix & QA for {d.name}...")
                    generate_rough_mix_wav(paths, d.name, ffmpeg_bin=ffmpeg_bin)


def run_pipeline_cycle(
    paths: pipeline_automator.PipelinePaths,
    preset: str,
    ffmpeg_bin: str = "ffmpeg",
    include_inbox: bool = True,
) -> None:
    """Execute pipeline stages sequentially with granular stage activity telemetry."""
    if include_inbox:
        set_activity(True, "Stage 1/2: Splitting Stems (Demucs)...")
        pipeline_automator.process_inbox(paths)

    set_activity(True, "Stage 2: Tonal Stem Prep & Triggers...")
    pipeline_automator.run_stem_prep(paths, preset=preset)

    set_activity(True, "Stage 3/4: Generating MIDI & BPM/Key...")
    pipeline_automator.generate_midi_and_metadata(paths, preset=preset)

    backfill_rough_mixes(paths, ffmpeg_bin=ffmpeg_bin)

    set_activity(True, "Stage 6: Running Mix QA Analyzer...")
    pipeline_automator.process_mix_renders(paths, ffmpeg_bin=ffmpeg_bin)


# --------------------------------------------------------------------------
# Background Watcher Thread
# --------------------------------------------------------------------------

class WatcherThread(threading.Thread):
    """Background polling watcher thread checking pipeline folders."""

    def __init__(
        self,
        paths: pipeline_automator.PipelinePaths,
        ffmpeg_bin: str = "ffmpeg",
    ) -> None:
        super().__init__(daemon=True, name="PipelineWatcherThread")
        self.paths = paths
        self.ffmpeg_bin = ffmpeg_bin
        self.stop_event = threading.Event()

    def run(self) -> None:
        log.info("Background Watcher Thread active (poll interval: %.1fs).", POLL_INTERVAL)
        while not self.stop_event.is_set():
            if WATCHER_ENABLED and not IS_BUSY:
                task_desc = has_pending_work(self.paths)
                if task_desc is not None:
                    # Attempt non-blocking lock acquisition
                    acquired = PROCESSING_LOCK.acquire(blocking=False)
                    if acquired:
                        try:
                            set_activity(True, task_desc)
                            run_pipeline_cycle(
                                self.paths,
                                preset=ACTIVE_PRESET,
                                ffmpeg_bin=self.ffmpeg_bin,
                                include_inbox=True,
                            )
                        except Exception as exc:
                            log.error("Watcher cycle error: %s", exc, exc_info=True)
                        finally:
                            set_activity(False, "Idle")
                            PROCESSING_LOCK.release()

            # Responsive sleep in slices
            slices = int(max(1, POLL_INTERVAL / 0.25))
            for _ in range(slices):
                if self.stop_event.is_set():
                    break
                time.sleep(POLL_INTERVAL / slices)

        log.info("Background Watcher Thread cleanly terminated.")

    def stop(self) -> None:
        self.stop_event.set()


# --------------------------------------------------------------------------
# HTTP Request Handler
# --------------------------------------------------------------------------

class PipelineRequestHandler(BaseHTTPRequestHandler):
    """REST API & Audio Streaming HTTP Request Handler."""

    server_paths: pipeline_automator.PipelinePaths
    ffmpeg_bin: str

    def log_message(self, format: str, *args: Any) -> None:
        """Suppress standard HTTP server access spam on console."""
        log.debug("%s - - [%s] %s", self.client_address[0], self.log_date_time_string(), format % args)

    def send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Range, Authorization")

    def send_json_response(self, data: Any, status: int = HTTPStatus.OK, head_only: bool = False) -> None:
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_cors_headers()
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_cors_headers()
        self.end_headers()

    def do_HEAD(self) -> None:
        self.do_GET(head_only=True)

    # ----------------------------------------------------------------------
    # GET Endpoints
    # ----------------------------------------------------------------------

    def do_GET(self, head_only: bool = False) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 0. Favicon Handler
        if path == "/favicon.ico":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_cors_headers()
            self.end_headers()
            return

        # 1. UI Root
        if path in ("/", "/index.html"):
            ui_index = SCRIPT_DIR / "ui" / "index.html"
            if not ui_index.is_file():
                ui_index = self.server_paths.automation / "ui" / "index.html"
            if not ui_index.is_file():
                self.send_error(HTTPStatus.NOT_FOUND, f"UI not found at {ui_index}")
                return
            body = ui_index.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_cors_headers()
            self.end_headers()
            if not head_only:
                self.wfile.write(body)
            return

        # 2. GET /api/status
        if path == "/api/status":
            counts = get_pipeline_counts(self.server_paths)
            recent_logs = get_recent_logs(self.server_paths.logs / "pipeline.log", max_lines=60)
            status_data = {
                "watcher_running": WATCHER_ENABLED,
                "pid": os.getpid(),
                "preset": ACTIVE_PRESET,
                "poll_interval": POLL_INTERVAL,
                "is_busy": IS_BUSY,
                "current_task": CURRENT_TASK,
                "counts": counts,
                "logs": recent_logs,
            }
            self.send_json_response(status_data, head_only=head_only)
            return

        # 3. GET /api/tracks
        if path == "/api/tracks":
            tracks_data = discover_tracks(self.server_paths)
            self.send_json_response(tracks_data, head_only=head_only)
            return

        # 4. GET /api/audio?path=<rel_path> (HTTP 206 Partial Content)
        if path == "/api/audio":
            rel_param = query.get("path", [""])[0]
            if not rel_param:
                self.send_error(HTTPStatus.BAD_REQUEST, "Missing 'path' parameter")
                return

            safe, abs_target = is_safe_path(self.server_paths.base, rel_param)
            if not safe or abs_target is None:
                self.send_error(HTTPStatus.FORBIDDEN, "Access denied: Path outside pipeline sandbox")
                return

            if not abs_target.is_file():
                self.send_error(HTTPStatus.NOT_FOUND, f"Audio file not found: {rel_param}")
                return

            self.stream_audio_file(abs_target, head_only=head_only)
            return

        # 5. GET /api/download?path=<rel_path>
        if path == "/api/download":
            rel_param = query.get("path", [""])[0]
            if not rel_param:
                self.send_error(HTTPStatus.BAD_REQUEST, "Missing 'path' parameter")
                return

            safe, abs_target = is_safe_path(self.server_paths.base, rel_param)
            if not safe or abs_target is None:
                self.send_error(HTTPStatus.FORBIDDEN, "Access denied: Path outside pipeline sandbox")
                return

            if not abs_target.is_file():
                self.send_error(HTTPStatus.NOT_FOUND, f"File not found: {rel_param}")
                return

            # Determine content type
            ext = abs_target.suffix.lower()
            mime_types = {
                ".wav": "audio/wav",
                ".mid": "audio/midi",
                ".midi": "audio/midi",
                ".json": "application/json",
                ".md": "text/markdown",
                ".txt": "text/plain",
                ".flp": "application/octet-stream",
            }
            ctype = mime_types.get(ext, "application/octet-stream")
            file_size = abs_target.stat().st_size

            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Content-Disposition", f'attachment; filename="{abs_target.name}"')
            self.send_cors_headers()
            self.end_headers()

            if not head_only:
                try:
                    with open(abs_target, "rb") as f:
                        shutil.copyfileobj(f, self.wfile, length=64 * 1024)
                except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
                    pass
            return

        self.send_error(HTTPStatus.NOT_FOUND, f"Endpoint {path} not found")

    def stream_audio_file(self, abs_path: Path, head_only: bool = False) -> None:
        """Stream audio file with full HTTP 206 Partial Content byte-range support."""
        file_size = abs_path.stat().st_size
        range_header = self.headers.get("Range")

        if not range_header:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(file_size))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-cache")
            self.send_cors_headers()
            self.end_headers()
            if not head_only:
                try:
                    with open(abs_path, "rb") as f:
                        shutil.copyfileobj(f, self.wfile, length=64 * 1024)
                except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
                    pass
            return

        m = re.match(r"^bytes=(\d*)-(\d*)$", range_header.strip())
        if not m:
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Content-Range", f"bytes */{file_size}")
            self.send_cors_headers()
            self.end_headers()
            return

        raw_start, raw_end = m.group(1), m.group(2)
        if raw_start and raw_end:
            start = int(raw_start)
            end = int(raw_end)
        elif raw_start:
            start = int(raw_start)
            end = file_size - 1
        elif raw_end:
            length = int(raw_end)
            start = max(0, file_size - length)
            end = file_size - 1
        else:
            start = 0
            end = file_size - 1

        if start > end or start >= file_size:
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Content-Range", f"bytes */{file_size}")
            self.send_cors_headers()
            self.end_headers()
            return

        end = min(end, file_size - 1)
        chunk_len = end - start + 1

        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.send_header("Content-Length", str(chunk_len))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        self.send_cors_headers()
        self.end_headers()

        if head_only:
            return

        with open(abs_path, "rb") as f:
            f.seek(start)
            bytes_left = chunk_len
            buf_size = 64 * 1024
            while bytes_left > 0:
                read_sz = min(buf_size, bytes_left)
                data = f.read(read_sz)
                if not data:
                    break
                try:
                    self.wfile.write(data)
                except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
                    break
                bytes_left -= len(data)

    # ----------------------------------------------------------------------
    # POST Endpoints
    # ----------------------------------------------------------------------

    def do_POST(self) -> None:
        global WATCHER_ENABLED, ACTIVE_PRESET

        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        content_length = int(self.headers.get("Content-Length", 0))
        content_type = self.headers.get("Content-Type", "").split(";")[0].strip().lower()

        if path == "/api/upload":
            self._handle_upload(query, content_length, content_type)
            return

        body_bytes = self.rfile.read(content_length) if content_length > 0 else b""

        body_json: Dict[str, Any] = {}
        if body_bytes:
            try:
                body_json = json.loads(body_bytes.decode("utf-8"))
            except Exception:
                pass

        # 1. POST /api/watcher
        if path == "/api/watcher":
            if "running" in body_json:
                WATCHER_ENABLED = bool(body_json["running"])
            if "preset" in body_json and body_json["preset"] in pipeline_automator.PRESETS:
                ACTIVE_PRESET = body_json["preset"]
            log.info("Watcher state updated: running=%s, preset=%s", WATCHER_ENABLED, ACTIVE_PRESET)
            self.send_json_response({"status": "ok", "watcher_running": WATCHER_ENABLED, "preset": ACTIVE_PRESET})
            return

        # 2. POST /api/run-once
        if path == "/api/run-once":
            if "preset" in body_json and body_json["preset"] in pipeline_automator.PRESETS:
                ACTIVE_PRESET = body_json["preset"]

            if IS_BUSY:
                self.send_json_response({"status": "busy", "message": f"Processing already in progress: {CURRENT_TASK}"}, status=HTTPStatus.CONFLICT)
                return

            def worker() -> None:
                acquired = PROCESSING_LOCK.acquire(blocking=True)
                if acquired:
                    try:
                        run_pipeline_cycle(
                            self.server_paths,
                            preset=ACTIVE_PRESET,
                            ffmpeg_bin=self.ffmpeg_bin,
                            include_inbox=True,
                        )
                    except Exception as exc:
                        log.error("Error during manual pipeline run: %s", exc, exc_info=True)
                    finally:
                        set_activity(False, "Idle")
                        PROCESSING_LOCK.release()

            t = threading.Thread(target=worker, daemon=True, name="ManualRunThread")
            t.start()
            self.send_json_response({"status": "started", "message": "Pipeline run started in background", "preset": ACTIVE_PRESET})
            return

        # 3. POST /api/reprocess
        if path == "/api/reprocess":
            track = body_json.get("track", "").strip()
            preset = body_json.get("preset", ACTIVE_PRESET)
            if preset not in pipeline_automator.PRESETS:
                preset = ACTIVE_PRESET

            if not track:
                self.send_json_response({"status": "error", "message": "Missing 'track' parameter"}, status=HTTPStatus.BAD_REQUEST)
                return

            safe, abs_prep = is_safe_path(self.server_paths.prepped, track)
            if not safe or abs_prep is None:
                self.send_json_response({"status": "error", "message": "Unsafe track path"}, status=HTTPStatus.FORBIDDEN)
                return

            # Invalidate done markers for this track
            (abs_prep / ".done").unlink(missing_ok=True)
            (abs_prep / "MIDI" / ".midi_done").unlink(missing_ok=True)

            def reprocess_worker() -> None:
                with PROCESSING_LOCK:
                    try:
                        set_activity(True, f"Re-processing track {track}...")
                        run_pipeline_cycle(
                            self.server_paths,
                            preset=preset,
                            ffmpeg_bin=self.ffmpeg_bin,
                            include_inbox=False,
                        )
                    except Exception as exc:
                        log.error("Reprocess error on %s: %s", track, exc, exc_info=True)
                    finally:
                        set_activity(False, "Idle")

            t = threading.Thread(target=reprocess_worker, daemon=True, name="ReprocessWorker")
            t.start()
            self.send_json_response({"status": "ok", "message": f"Reprocessing {track} initiated", "track": track, "preset": preset})
            return

        # 4. POST /api/import-rendered
        if path == "/api/import-rendered":
            base_name = body_json.get("base_name", "").strip()
            preset = body_json.get("preset", ACTIVE_PRESET)
            if preset not in pipeline_automator.PRESETS:
                preset = ACTIVE_PRESET

            if not base_name:
                self.send_json_response({"status": "error", "message": "Missing 'base_name'"}, status=HTTPStatus.BAD_REQUEST)
                return

            def import_worker() -> None:
                with PROCESSING_LOCK:
                    try:
                        clean = sanitize_track_name(base_name)
                        set_activity(True, f"Importing rendered stems for {clean}...")
                        import_rendered_track(base_name, self.server_paths, preset=preset, ffmpeg_bin=self.ffmpeg_bin)
                    except Exception as exc:
                        log.error("Import rendered stems error on %s: %s", base_name, exc, exc_info=True)
                    finally:
                        set_activity(False, "Idle")

            t = threading.Thread(target=import_worker, daemon=True, name="ImportWorker")
            t.start()
            self.send_json_response({"status": "ok", "message": f"Import started for {base_name}", "base_name": base_name, "preset": preset})
            return

        # 5. POST /api/generate-rough-mix
        if path == "/api/generate-rough-mix":
            track = body_json.get("track", "").strip()
            if not track:
                self.send_json_response({"status": "error", "message": "Missing 'track' parameter"}, status=HTTPStatus.BAD_REQUEST)
                return

            safe, abs_prep = is_safe_path(self.server_paths.prepped, track)
            if not safe or abs_prep is None:
                self.send_json_response({"status": "error", "message": "Unsafe track path"}, status=HTTPStatus.FORBIDDEN)
                return

            def mix_worker() -> None:
                with PROCESSING_LOCK:
                    try:
                        set_activity(True, f"Generating rough mix for {track}...")
                        generate_rough_mix_wav(self.server_paths, track, ffmpeg_bin=self.ffmpeg_bin)
                    except Exception as exc:
                        log.error("Mix generation error on %s: %s", track, exc, exc_info=True)
                    finally:
                        set_activity(False, "Idle")

            t = threading.Thread(target=mix_worker, daemon=True, name="RoughMixWorker")
            t.start()
            self.send_json_response({"status": "ok", "message": f"Rough mix generation started for {track}", "track": track})
            return

        # 6. POST /api/open-flp
        if path == "/api/open-flp":
            track = body_json.get("track", "").strip()
            if not track:
                self.send_json_response({"status": "error", "message": "Missing 'track' parameter"}, status=HTTPStatus.BAD_REQUEST)
                return

            flp_target = self.server_paths.fl_project / track / f"{track}.flp"
            safe, abs_flp = is_safe_path(self.server_paths.fl_project, flp_target)
            if not safe or abs_flp is None or not abs_flp.is_file():
                self.send_json_response({"status": "error", "message": f"FLP not found at {flp_target}"}, status=HTTPStatus.NOT_FOUND)
                return

            if not os.path.isfile(FL64_EXE):
                self.send_json_response({"status": "error", "message": f"FL64.exe not found at {FL64_EXE}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
                return

            try:
                subprocess.Popen([FL64_EXE, str(abs_flp)], shell=False)
                log.info("[%s] Launched FL Studio 2024 with %s", track, abs_flp)
                self.send_json_response({"status": "ok", "message": f"Launched FL Studio with {abs_flp.name}", "path": str(abs_flp)})
            except Exception as exc:
                self.send_json_response({"status": "error", "message": f"Could not launch FL Studio: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # 7. POST /api/open-folder
        if path == "/api/open-folder":
            rel_folder = body_json.get("rel_path", "").strip()
            safe, abs_folder = is_safe_path(self.server_paths.base, rel_folder)
            if not safe or abs_folder is None:
                self.send_json_response({"status": "error", "message": "Unsafe folder path"}, status=HTTPStatus.FORBIDDEN)
                return

            if not abs_folder.is_dir():
                abs_folder.mkdir(parents=True, exist_ok=True)

            try:
                subprocess.Popen(["explorer.exe", str(abs_folder)], shell=False)
                log.info("Opened Explorer at %s", abs_folder)
                self.send_json_response({"status": "ok", "path": str(abs_folder)})
            except Exception as exc:
                self.send_json_response({"status": "error", "message": f"Could not open explorer: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self.send_error(HTTPStatus.NOT_FOUND, f"POST endpoint {path} not found")

    def _handle_upload(self, query: Dict[str, List[str]], content_length: int, content_type: str) -> None:
        """Handle raw binary streaming upload and backward-compatible JSON base64 upload."""
        if content_length > MAX_UPLOAD_BYTES:
            self.close_connection = True
            self.send_json_response(
                {"status": "error", "message": "Upload exceeds 500 MB limit"},
                status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
            )
            return

        is_json_mode = content_type == "application/json" or (not content_type and "filename" not in query)
        body_json: Dict[str, Any] = {}
        decoded_json_bytes: Optional[bytes] = None

        if is_json_mode:
            body_bytes = self.rfile.read(content_length) if content_length > 0 else b""
            if not body_bytes:
                self.send_json_response(
                    {"status": "error", "message": "Empty request body"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return
            try:
                body_json = json.loads(body_bytes.decode("utf-8"))
            except Exception as exc:
                self.send_json_response(
                    {"status": "error", "message": f"Invalid JSON payload: {exc}"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return

            target = str(body_json.get("target") or query.get("target", ["inbox"])[0]).strip()
            track = str(body_json.get("track") or query.get("track", [""])[0]).strip()
            raw_filename = str(body_json.get("filename") or query.get("filename", [""])[0])

            if "data_base64" not in body_json:
                self.send_json_response(
                    {"status": "error", "message": "Missing 'data_base64' in JSON upload payload"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return
            try:
                decoded_json_bytes = base64.b64decode(body_json["data_base64"])
            except Exception as exc:
                self.send_json_response(
                    {"status": "error", "message": f"Invalid base64 data: {exc}"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return

            if len(decoded_json_bytes) > MAX_UPLOAD_BYTES:
                self.send_json_response(
                    {"status": "error", "message": "Decoded upload exceeds 500 MB limit"},
                    status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                )
                return
        else:
            if content_length <= 0:
                self.send_json_response(
                    {"status": "error", "message": "Empty binary upload body"},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return
            target = str(query.get("target", ["inbox"])[0]).strip()
            track = str(query.get("track", [""])[0]).strip()
            raw_filename = str(query.get("filename", [""])[0])

        # Sanitize filename: strip null bytes, basename, strip remaining slashes
        sanitized = raw_filename.replace("\x00", "").strip()
        sanitized = os.path.basename(sanitized.replace("\\", "/"))
        sanitized = sanitized.replace("/", "").replace("\\", "").strip()
        if not sanitized or sanitized in (".", ".."):
            self.send_json_response(
                {"status": "error", "message": "Missing or invalid filename"},
                status=HTTPStatus.BAD_REQUEST,
            )
            return

        ext = Path(sanitized).suffix.lower()
        if ext not in ALLOWED_UPLOAD_EXTENSIONS:
            self.send_json_response(
                {
                    "status": "error",
                    "message": f"Unsupported file format '{ext}'. Allowed: .wav, .mp3, .flac, .m4a, .ogg",
                },
                status=HTTPStatus.BAD_REQUEST,
            )
            return

        stem_name = Path(sanitized).stem.strip()
        if not stem_name or stem_name in (".", ".."):
            self.send_json_response(
                {"status": "error", "message": "Invalid filename stem"},
                status=HTTPStatus.BAD_REQUEST,
            )
            return

        if target == "inbox":
            dest_dir = self.server_paths.inbox
        elif target == "moises":
            dest_dir = self.server_paths.stems / sanitize_track_name(track or stem_name)
        elif target == "renders":
            dest_dir = self.server_paths.renders
        else:
            self.send_json_response(
                {"status": "error", "message": f"Invalid upload target '{target}'"},
                status=HTTPStatus.BAD_REQUEST,
            )
            return

        final_wav_path = dest_dir / f"{stem_name}.wav"
        safe_base, abs_base_target = is_safe_path(self.server_paths.base, final_wav_path)
        safe_dir, abs_dir_target = is_safe_path(dest_dir, final_wav_path.name)
        if (
            not safe_base
            or not safe_dir
            or abs_base_target is None
            or abs_dir_target is None
            or abs_base_target != abs_dir_target
        ):
            self.send_json_response(
                {"status": "error", "message": "Unsafe destination file path"},
                status=HTTPStatus.FORBIDDEN,
            )
            return

        final_wav_path = abs_base_target
        dest_dir = final_wav_path.parent
        dest_dir.mkdir(parents=True, exist_ok=True)

        ts_ms = int(time.time() * 1000)
        tmp_in = dest_dir / f".upload_{ts_ms}_{sanitized}.tmp"
        tmp_wav = dest_dir / f".upload_{ts_ms}_{stem_name}.tmp.wav"

        try:
            if decoded_json_bytes is not None:
                tmp_in.write_bytes(decoded_json_bytes)
            else:
                remaining = content_length
                written = 0
                with open(tmp_in, "wb") as f:
                    while remaining > 0:
                        chunk = self.rfile.read(min(64 * 1024, remaining))
                        if not chunk:
                            raise EOFError("Client disconnected before upload completed")
                        written += len(chunk)
                        if written > MAX_UPLOAD_BYTES:
                            raise ValueError("Upload exceeds 500 MB limit")
                        f.write(chunk)
                        remaining -= len(chunk)

            if ext in {".mp3", ".flac", ".m4a", ".ogg"}:
                cmd = [
                    self.ffmpeg_bin,
                    "-hide_banner",
                    "-nostdin",
                    "-loglevel",
                    "error",
                    "-y",
                    "-i",
                    str(tmp_in),
                    "-c:a",
                    "pcm_s24le",
                    str(tmp_wav),
                ]
                res = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    shell=False,
                    timeout=120,
                    check=False,
                )
                tmp_in.unlink(missing_ok=True)
                if res.returncode != 0 or not tmp_wav.is_file():
                    tmp_wav.unlink(missing_ok=True)
                    err_detail = (res.stderr or "").strip() or f"ffmpeg exit code {res.returncode}"
                    self.send_json_response(
                        {"status": "error", "message": f"Audio transcoding failed: {err_detail}"},
                        status=HTTPStatus.BAD_REQUEST,
                    )
                    return
            else:
                tmp_wav = tmp_in

            # Determine canonical track_name and perform scoped invalidation
            if target == "inbox":
                m = INBOX_STEM_PATTERN.match(final_wav_path.stem)
                if m:
                    track_name = m.group(1).strip()
                    (self.server_paths.stems / track_name / final_wav_path.name).unlink(missing_ok=True)
                    (self.server_paths.prepped / track_name / ".done").unlink(missing_ok=True)
                    (self.server_paths.prepped / track_name / "MIDI" / ".midi_done").unlink(missing_ok=True)
                else:
                    track_name = final_wav_path.stem
                    stems_track_dir = self.server_paths.stems / track_name
                    if stems_track_dir.is_dir():
                        for old_wav in stems_track_dir.glob("*.wav"):
                            old_wav.unlink(missing_ok=True)
                    (self.server_paths.prepped / track_name / ".done").unlink(missing_ok=True)
                    (self.server_paths.prepped / track_name / "MIDI" / ".midi_done").unlink(missing_ok=True)
                    (self.server_paths.renders / f"{track_name}_RoughMix_Mix_QA_Report.md").unlink(missing_ok=True)

                os.replace(tmp_wav, final_wav_path)
            elif target == "moises":
                track_name = sanitize_track_name(track or final_wav_path.stem)
                os.replace(tmp_wav, final_wav_path)
                (self.server_paths.prepped / track_name / ".done").unlink(missing_ok=True)
                (self.server_paths.prepped / track_name / "MIDI" / ".midi_done").unlink(missing_ok=True)
            else:  # target == "renders"
                track_name = re.sub(r"(_RoughMix|_Mix|_Master)$", "", final_wav_path.stem, flags=re.IGNORECASE)
                os.replace(tmp_wav, final_wav_path)
                (self.server_paths.renders / f"{final_wav_path.stem}_Mix_QA_Report.md").unlink(missing_ok=True)

            final_size = final_wav_path.stat().st_size
            log.info("Uploaded %s -> %s (%d bytes, track=%s)", sanitized, final_wav_path, final_size, track_name)
            rel_out = str(final_wav_path.relative_to(self.server_paths.base)).replace("\\", "/")
            self.send_json_response({
                "status": "ok",
                "filename": final_wav_path.name,
                "track": track_name,
                "rel_path": rel_out,
                "size_bytes": final_size,
            })
        except subprocess.TimeoutExpired:
            tmp_in.unlink(missing_ok=True)
            tmp_wav.unlink(missing_ok=True)
            self.send_json_response(
                {"status": "error", "message": "Audio transcoding timed out (120s limit)"},
                status=HTTPStatus.REQUEST_TIMEOUT,
            )
        except Exception as exc:
            tmp_in.unlink(missing_ok=True)
            tmp_wav.unlink(missing_ok=True)
            self.send_json_response(
                {"status": "error", "message": f"Upload failed: {exc}"},
                status=HTTPStatus.INTERNAL_SERVER_ERROR,
            )


# --------------------------------------------------------------------------
# CLI Entry Point & Server Bootstrap
# --------------------------------------------------------------------------

def setup_server_logging(log_dir: Path, verbose: bool = False) -> None:
    """Configure console and file logging for automator and server."""
    pipeline_automator.setup_logging(log_dir, verbose=verbose)
    server_log = logging.getLogger("pipeline_server")
    server_log.setLevel(logging.DEBUG if verbose else logging.INFO)
    server_log.handlers.clear()
    for h in pipeline_automator.log.handlers:
        server_log.addHandler(h)


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Suno Music Pipeline Studio Dashboard & Automation Server.")
    parser.add_argument("--base-dir", default=os.environ.get(ENV_BASE_DIR, DEFAULT_BASE_DIR), help="Pipeline base directory")
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"Binding host (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Binding port (default: {DEFAULT_PORT})")
    parser.add_argument("--preset", choices=pipeline_automator.PRESETS, default="gentle", help="Default stem prep filter preset")
    parser.add_argument("--poll-interval", type=float, default=2.0, help="Watcher poll interval in seconds")
    parser.add_argument("--no-watcher", action="store_true", help="Start web dashboard with background watcher paused")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="FFmpeg executable name or path")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose debug logging")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    global WATCHER_ENABLED, ACTIVE_PRESET, POLL_INTERVAL

    args = parse_args(argv)
    base_dir = Path(args.base_dir).expanduser().resolve()
    paths = pipeline_automator.PipelinePaths(base_dir)
    paths.ensure_dirs()

    # Logging setup
    setup_server_logging(paths.logs, verbose=args.verbose)
    log.info("================================================================")
    log.info("Starting Suno Music Pipeline Studio Dashboard Server...")
    log.info("Base Directory : %s", base_dir)
    log.info("Listening on   : http://%s:%d", args.host, args.port)
    log.info("Default Preset : %s", args.preset)
    log.info("Watcher Active : %s", not args.no_watcher)
    log.info("================================================================")

    ACTIVE_PRESET = args.preset
    POLL_INTERVAL = args.poll_interval
    WATCHER_ENABLED = not args.no_watcher

    # Handover: Cleanly terminate previous standalone watcher and record server PID
    handle_watcher_pid_handover(paths)
    atexit.register(cleanup_pids, paths)

    # Initialize Watcher background thread
    watcher_thread = WatcherThread(paths, ffmpeg_bin=args.ffmpeg)
    watcher_thread.start()

    # Inject paths into request handler
    PipelineRequestHandler.server_paths = paths
    PipelineRequestHandler.ffmpeg_bin = args.ffmpeg

    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer((args.host, args.port), PipelineRequestHandler)

    def shutdown_signal_handler(signum: int, frame: Any) -> None:
        log.info("Received signal %d; shutting down Pipeline Studio Server...", signum)
        watcher_thread.stop()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, shutdown_signal_handler)
    signal.signal(signal.SIGTERM, shutdown_signal_handler)

    try:
        log.info("Pipeline Studio Dashboard running. Open in browser: http://%s:%d", args.host, args.port)
        server.serve_forever()
    except BaseException as exc:
        log.error("Fatal exception in server loop: %s", exc, exc_info=True)
        return 1
    finally:
        log.info("Server finally block executing...")
        watcher_thread.stop()
        server.server_close()
        cleanup_pids(paths)
        log.info("Pipeline Studio Dashboard server exited cleanly.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
