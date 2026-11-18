#!/usr/bin/env python3
"""Suno Music Pipeline Studio Dashboard & Automation Server.

Multi-threaded local HTTP server (standard library only) providing:
- A background watcher that drives the 6-stage pipeline, with failure
  tracking so a broken step is reported once instead of retried forever.
- A REST API for pipeline status, track metadata and actions, including
  the Humanized Mix renderer (humanized_mix.py).
- HTTP 206 Partial Content audio streaming for in-browser audition.
- Launching FL Studio and Windows Explorer for the local user.

Security model: the server binds to 127.0.0.1 and only answers requests
whose Host is a loopback name (blocks DNS rebinding) and whose Origin, if
sent, is the dashboard itself (blocks other websites driving the API).
"""

from __future__ import annotations

import argparse
import atexit
import base64
import ctypes
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
from typing import Any, Callable, Dict, List, Optional, Tuple
import urllib.parse

# Ensure local automation directory is on sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import humanized_mix
import pipeline_automator
from pipeline_automator import INBOX_STEM_PATTERN, qa_report_path, render_kind, render_track_name, renders_for_track

# --------------------------------------------------------------------------
# Configuration & Constants
# --------------------------------------------------------------------------

DEFAULT_BASE_DIR = "C:/Music_Pipeline"
ENV_BASE_DIR = "MUSIC_PIPELINE_DIR"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
FL64_EXE = os.environ.get("FL_STUDIO_EXE", "").strip() or r"C:\Program Files (x86)\Image-Line\FL Studio 2024\FL64.exe"


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
RENDERED_STEM_PATTERN = re.compile(r"^(.*)_(bass|drums|instruments|vocals)\.wav$", re.IGNORECASE)

ALLOWED_UPLOAD_EXTENSIONS = {".wav", ".mp3", ".flac", ".m4a", ".ogg"}
MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB

LOOPBACK_HOSTNAMES = {"127.0.0.1", "localhost", "::1"}
EXTRA_ALLOWED_HOSTNAMES: set = set()  # filled from --allow-host
# Content types a browser may send cross-site without a CORS preflight.
SIMPLE_CONTENT_TYPES = {"text/plain", "application/x-www-form-urlencoded", "multipart/form-data"}

log = logging.getLogger("pipeline_server")

# --------------------------------------------------------------------------
# Global Mutex & Server State
# --------------------------------------------------------------------------

PROCESSING_LOCK = threading.Lock()
_STATE_LOCK = threading.Lock()
IS_BUSY: bool = False
CURRENT_TASK: str = "Idle"
QUEUED_JOBS: int = 0
WATCHER_ENABLED: bool = True
AUTO_HUMANIZE: bool = True
ACTIVE_PRESET: str = "gentle"
POLL_INTERVAL: float = 2.0


def set_activity(busy: bool, task: str) -> None:
    """Thread-safe update of server activity state."""
    global IS_BUSY, CURRENT_TASK
    with _STATE_LOCK:
        IS_BUSY = busy
        CURRENT_TASK = task


def _adjust_queue(delta: int) -> None:
    global QUEUED_JOBS
    with _STATE_LOCK:
        QUEUED_JOBS = max(0, QUEUED_JOBS + delta)


def start_job(name: str, fn: Callable[[], None]) -> None:
    """Run fn in a background thread while holding PROCESSING_LOCK.

    Jobs queue behind each other (and behind the watcher) instead of racing:
    anything that invalidates markers must do so inside fn, after the lock
    is held, so the watcher can't pick the track up half-way.
    """
    _adjust_queue(1)

    def runner() -> None:
        with PROCESSING_LOCK:
            _adjust_queue(-1)
            try:
                set_activity(True, name)
                fn()
            except Exception as exc:
                log.error("%s failed: %s", name, exc, exc_info=True)
            finally:
                set_activity(False, "Idle")

    threading.Thread(target=runner, daemon=True, name=f"Job:{name[:40]}").start()


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
    """Check if process PID is running without external dependencies."""
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
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def pid_is_python(pid: int) -> bool:
    """True only if PID is a Python process (guards against a stale PID file
    pointing at an unrelated program after Windows reuses the number)."""
    try:
        if os.name == "nt":
            res = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                capture_output=True, text=True, check=False, timeout=10,
            )
            return "python" in res.stdout.lower() or "py.exe" in res.stdout.lower()
        cmdline = Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\x00", b" ").decode("utf-8", "replace")
        return "python" in cmdline.lower()
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
    """Terminate a previous standalone watcher process and claim PID ownership."""
    current_pid = os.getpid()
    pid_file = paths.pid_file
    server_pid_file = paths.automation / ".server.pid"

    if pid_file.is_file():
        try:
            content = pid_file.read_text(encoding="utf-8").strip()
            if content:
                old_pid = int(content)
                if old_pid != current_pid and is_pid_running(old_pid):
                    if pid_is_python(old_pid):
                        log.info("Stopping previous standalone watcher (PID %d) for clean handover...", old_pid)
                        terminate_process_tree(old_pid)
                    else:
                        log.warning("Stale PID file points at PID %d, which is not Python; leaving it alone.", old_pid)
        except Exception as exc:
            log.warning("Error inspecting old watcher PID file %s: %s", pid_file, exc)

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

_QA_CACHE: Dict[str, Tuple[int, Dict[str, Any]]] = {}
_QA_CACHE_LOCK = threading.Lock()


def _qa_metric(content: str, label: str, unit: str) -> Optional[float]:
    m = re.search(re.escape(label) + r"\s*\*\*\s*\|\s*\*\*([-\d\.]+)\s*" + re.escape(unit), content)
    return float(m.group(1)) if m else None


def parse_mix_qa_report(report_path: Path) -> Dict[str, Any]:
    """Parse Mix QA Markdown report into structured telemetry (cached by mtime)."""
    if not report_path.is_file():
        return {}
    mtime = report_path.stat().st_mtime_ns
    key = str(report_path)
    with _QA_CACHE_LOCK:
        hit = _QA_CACHE.get(key)
        if hit and hit[0] == mtime:
            return dict(hit[1])

    content = report_path.read_text(encoding="utf-8", errors="replace")
    method = re.search(r"\*\*Loudness Measured With\*\*:\s*`([^`]+)`", content)
    data: Dict[str, Any] = {
        "raw_markdown": content,
        "report_rel_name": report_path.name,
        "loudness_method": method.group(1) if method else None,
        "integrated_lufs": _qa_metric(content, "Integrated Loudness", "LUFS"),
        "true_peak_dbtp": _qa_metric(content, "True Peak", "dBTP"),
        "crest_factor_db": _qa_metric(content, "Crest Factor", "dB"),
        "lra_lu": _qa_metric(content, "Loudness Range (LRA)", "LU"),
        "peak_dbfs": _qa_metric(content, "Peak Amplitude", "dBFS"),
        "rms_dbfs": _qa_metric(content, "RMS Level", "dBFS"),
        "bands": [],
        "fixes": [],
    }

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

    fix_sec = re.search(r"## 3\. Recommended Actionable Fix List\s*\n+(.*?)(?=\n##|$)", content, re.DOTALL)
    if fix_sec:
        for line in fix_sec.group(1).strip().splitlines():
            line = line.strip().lstrip("-* \t")
            if not line:
                continue
            parts = re.split(r"\s+[–—]\s+", line, maxsplit=3)
            if len(parts) >= 4:
                data["fixes"].append({
                    "timestamp": parts[0].strip(),
                    "element": parts[1].strip(),
                    "issue": parts[2].strip(),
                    "move": parts[3].strip(),
                })
            else:
                data["fixes"].append({"timestamp": "", "element": "Mix", "issue": "", "move": line})

    with _QA_CACHE_LOCK:
        _QA_CACHE[key] = (mtime, data)
    return dict(data)


# --------------------------------------------------------------------------
# Pipeline Telemetry & Data Discovery
# --------------------------------------------------------------------------

def rel(paths: pipeline_automator.PipelinePaths, p: Path) -> str:
    return str(p.relative_to(paths.base)).replace("\\", "/")


def pending_rough_mix(paths: pipeline_automator.PipelinePaths) -> List[str]:
    return humanized_mix.pending_rough(paths)


def has_pending_work(paths: pipeline_automator.PipelinePaths) -> Optional[str]:
    """Describe the next pending pipeline step, or None if idle.

    Uses the same pending_* definitions the stages themselves use, so the
    watcher and the stages can never disagree about what's left to do.
    """
    if pipeline_automator.pending_inbox(paths):
        return "Processing 01_Suno_Inbox..."
    if pipeline_automator.pending_stem_tracks(paths):
        return "Running Stem Prep..."
    if pipeline_automator.pending_midi_tracks(paths):
        return "Generating MIDI & Metadata..."
    if pipeline_automator.pending_mix_renders(paths):
        return "Running Mix QA Analysis..."
    rough = pending_rough_mix(paths)
    if rough:
        return f"Generating Rough Mix & QA for {rough[0]}..."
    if AUTO_HUMANIZE:
        human = humanized_mix.pending_humanized(paths)
        if human:
            return f"Rendering Humanized Mix for {human[0]}..."
    return None


def rendered_stem_groups() -> Dict[str, Dict[str, str]]:
    """{base_name: {kind: filename}} for 4-stem sets in FL Studio's Rendered folder."""
    groups: Dict[str, Dict[str, str]] = {}
    if not RENDERED_DIR.exists():
        return groups
    try:
        for f in os.listdir(RENDERED_DIR):
            m = RENDERED_STEM_PATTERN.match(f)
            if m:
                groups.setdefault(m.group(1), {})[m.group(2).lower()] = f
    except OSError as exc:
        log.warning("Could not list RENDERED_DIR: %s", exc)
    return groups


def get_pipeline_counts(paths: pipeline_automator.PipelinePaths) -> Dict[str, int]:
    """Compute live entity counts across the 6 pipeline stages."""
    vw, vd = pipeline_automator.visible_wavs, pipeline_automator.visible_dirs
    return {
        "inbox": len(vw(paths.inbox)),
        "moises_stems": len(vd(paths.stems)),
        "prepped_tracks": len([p for p in vd(paths.prepped) if (p / ".done").exists()]),
        "fl_projects": len(list(paths.fl_project.glob("*/*.flp"))) if paths.fl_project.exists() else 0,
        "mix_renders": len(vw(paths.renders)),
        "available_rendered_sets": sum(1 for s in rendered_stem_groups().values() if len(s) == 4),
        "failures": len(pipeline_automator.failures(paths).all()),
    }


def get_recent_logs(log_file: Path, max_lines: int = 60) -> List[str]:
    """Return the last log lines, reading only the end of the file."""
    if not log_file.is_file():
        return []
    try:
        with open(log_file, "rb") as f:
            f.seek(0, os.SEEK_END)
            size = f.tell()
            f.seek(max(0, size - 64 * 1024))
            tail = f.read().decode("utf-8", errors="replace")
        lines = tail.splitlines()
        if size > 64 * 1024:
            lines = lines[1:]  # first line is probably cut in half
        return lines[-max_lines:]
    except Exception as exc:
        return [f"[ERROR] Could not read log file: {exc}"]


STAGE_LABELS = {
    "demucs": "Stem separation (Demucs)",
    "stem_prep": "Stem prep",
    "midi": "MIDI generation",
    "rough_mix": "Rough mix",
    "humanized_mix": "Humanized mix",
    "mix_qa": "Mix QA",
}


def _render_entry(paths: pipeline_automator.PipelinePaths, wav: Path) -> Dict[str, Any]:
    report = qa_report_path(wav)
    return {
        "name": wav.name,
        "kind": render_kind(wav.stem),
        "rel_path": rel(paths, wav),
        "size_mb": round(wav.stat().st_size / 1048576, 2),
        "modified": wav.stat().st_mtime,
        "qa": parse_mix_qa_report(report) if report.is_file() else None,
    }


def discover_tracks(paths: pipeline_automator.PipelinePaths) -> Dict[str, Any]:
    """Discover all tracks across stages, metadata, stems, triggers, MIDI, and renders."""
    vw, vd = pipeline_automator.visible_wavs, pipeline_automator.visible_dirs
    reg = pipeline_automator.failures(paths)
    all_failures = reg.all()

    track_names = set()
    for f in vw(paths.inbox):
        m = INBOX_STEM_PATTERN.match(f.stem)
        t_name = m.group(1).strip() if m else f.stem
        if t_name:
            track_names.add(t_name)
    for root in (paths.stems, paths.prepped, paths.fl_project):
        track_names.update(d.name for d in vd(root))
    for f in vw(paths.renders):
        track_names.add(render_track_name(f.stem))

    tracks_list = []
    for name in sorted(track_names):
        track_info: Dict[str, Any] = {
            "name": name,
            "status": "Splitting Stems (Demucs)...",
            "metadata": {},
            "source_stems": [],
            "prepped_stems": [],
            "drum_triggers": [],
            "midi_files": [],
            "performed_stems": [],
            "fl_project": {"exists": False, "rel_path": "", "abs_path": "", "size_mb": 0.0},
            "renders": [],
            "mix_qa": None,
            "humanize": None,
            "failures": [],
        }

        src_dir = paths.stems / name
        for f in vw(src_dir):
            track_info["source_stems"].append({"name": f.name, "rel_path": rel(paths, f), "size_mb": round(f.stat().st_size / 1048576, 2)})

        prep_dir = paths.prepped / name
        if prep_dir.is_dir():
            meta_path = prep_dir / "track_metadata.json"
            if meta_path.is_file():
                try:
                    track_info["metadata"] = json.loads(meta_path.read_text(encoding="utf-8"))
                except Exception:
                    pass

            for f in vw(prep_dir / "Audio_Stems"):
                kind = "other"
                for k, kw_list in pipeline_automator.STEM_KEYWORDS:
                    if any(kw in f.name.lower() for kw in kw_list):
                        kind = k
                        break
                track_info["prepped_stems"].append({"name": f.name, "kind": kind, "rel_path": rel(paths, f), "size_mb": round(f.stat().st_size / 1048576, 2)})

            for f in vw(prep_dir / "Drum_Triggers"):
                low = f.name.lower()
                band = "Kick" if "kick" in low else "Snare" if "snare" in low else "Hat" if "hat" in low else "Perc"
                track_info["drum_triggers"].append({"name": f.name, "band": band, "rel_path": rel(paths, f), "size_mb": round(f.stat().st_size / 1048576, 2)})

            for f in vw(prep_dir / humanized_mix.HUMANIZED_STEMS_DIR):
                track_info["performed_stems"].append({"name": f.name, "kind": "drums" if "drum" in f.name.lower() else "bass", "rel_path": rel(paths, f), "size_mb": round(f.stat().st_size / 1048576, 2)})

            midi_dir = prep_dir / "MIDI"
            if midi_dir.is_dir():
                for f in sorted(midi_dir.glob("*.mid")):
                    low = f.name.lower()
                    role = "FPC Drums" if ("drums" in low or "fpc" in low) else "Bass" if "bass" in low else "MIDI"
                    if "humanized" in low:
                        role += " (Humanized)"
                    track_info["midi_files"].append({"name": f.name, "role": role, "rel_path": rel(paths, f), "size_kb": round(f.stat().st_size / 1024, 1)})

            settings_path = prep_dir / humanized_mix.SETTINGS_FILE
            try:
                track_info["humanize"] = json.loads(settings_path.read_text(encoding="utf-8")) if settings_path.is_file() else humanized_mix.HumanizeSettings().to_dict()
            except (OSError, ValueError):
                track_info["humanize"] = humanized_mix.HumanizeSettings().to_dict()

        flp_path = paths.fl_project / name / f"{name}.flp"
        if flp_path.is_file():
            track_info["fl_project"] = {"exists": True, "rel_path": rel(paths, flp_path), "abs_path": str(flp_path), "size_mb": round(flp_path.stat().st_size / 1048576, 2)}

        # Renders that belong to exactly this track (no prefix matching)
        renders = [_render_entry(paths, w) for w in renders_for_track(paths, name)]
        priority = {"humanized": 0, "render": 1, "rough": 2}
        renders.sort(key=lambda r: (priority.get(r["kind"], 3), -r["modified"]))
        track_info["renders"] = renders
        best = next((r for r in renders if r["qa"]), None)
        if best:
            track_info["mix_qa"] = {**best["qa"], "audio_rel_path": best["rel_path"], "render_kind": best["kind"]}

        # Failures for this track (a render's failure is keyed by its file stem)
        track_failures = [f for f in all_failures if f.get("track") == name or render_track_name(str(f.get("track", ""))) == name]
        track_info["failures"] = [{**f, "stage_label": STAGE_LABELS.get(f.get("stage", ""), f.get("stage", ""))} for f in track_failures]

        if track_info["failures"]:
            track_info["status"] = f"Failed: {track_info['failures'][0]['stage_label']}"
        elif any(r["kind"] == "humanized" and r["qa"] for r in renders):
            track_info["status"] = "Humanized Mix Ready"
        elif track_info["mix_qa"] is not None:
            track_info["status"] = "Mix Rendered & Audited"
        elif (prep_dir / "MIDI" / ".midi_done").exists():
            track_info["status"] = "Prepped & Ready"
        elif (prep_dir / ".done").exists():
            track_info["status"] = "Generating MIDI..."
        elif vw(src_dir):
            track_info["status"] = "Prepping Stems..."
        else:
            track_info["status"] = "Splitting Stems (Demucs)..."

        tracks_list.append(track_info)

    available_rendered = []
    for base_n, stems in sorted(rendered_stem_groups().items()):
        clean_id = sanitize_track_name(base_n)
        available_rendered.append({
            "track_name": base_n,
            "clean_id": clean_id,
            "stem_count": len(stems),
            "stems": sorted(stems.keys()),
            "already_imported": (paths.stems / clean_id).exists() or (paths.prepped / clean_id).exists(),
        })

    inbox_files = [{"name": f.name, "size_mb": round(f.stat().st_size / 1048576, 2), "rel_path": rel(paths, f)} for f in vw(paths.inbox)]

    return {"tracks": tracks_list, "available_rendered": available_rendered, "inbox_files": inbox_files}


# --------------------------------------------------------------------------
# Pipeline Action Helpers
# --------------------------------------------------------------------------

def invalidate_track_outputs(paths: pipeline_automator.PipelinePaths, track: str, renders: bool = True) -> None:
    """Remove done-markers (and optionally generated mixes + reports) so a track rebuilds cleanly."""
    prep = paths.prepped / track
    (prep / ".done").unlink(missing_ok=True)
    (prep / "MIDI" / ".midi_done").unlink(missing_ok=True)
    if renders:
        for suffix in ("_RoughMix", "_Humanized"):
            wav = paths.renders / f"{track}{suffix}.wav"
            wav.unlink(missing_ok=True)
            qa_report_path(wav).unlink(missing_ok=True)
    pipeline_automator.failures(paths).clear(track=track)
    for suffix in ("_RoughMix", "_Humanized"):
        pipeline_automator.failures(paths).clear(track=f"{track}{suffix}")


def generate_rough_mix_wav(
    paths: pipeline_automator.PipelinePaths,
    track_name: str,
    ffmpeg_bin: str = "ffmpeg",
) -> Tuple[bool, str]:
    """Sum the prepped stems (original drums & bass) into <Track>_RoughMix.wav and run Mix QA.

    Mastered with the same loudness target as the humanized mix, so the two
    can be A/B compared at equal loudness.
    """
    if not pipeline_automator.visible_wavs(paths.prepped / track_name / "Audio_Stems"):
        return False, f"No prepped WAV stems found for {track_name}"
    out = humanized_mix.run_rough(paths, track_name, ffmpeg_bin=ffmpeg_bin)
    return (True, str(out)) if out else (False, "Rough mix failed; see the track's failure details")


def import_rendered_track(
    base_name: str,
    paths: pipeline_automator.PipelinePaths,
    preset: str = "gentle",
    ffmpeg_bin: str = "ffmpeg",
) -> Tuple[bool, str]:
    """Import a 4-stem set from FL's Rendered folder and run the pipeline on it."""
    matching_stems = rendered_stem_groups().get(base_name)
    if not matching_stems:
        return False, f"No matching stems found for base name '{base_name}' in {RENDERED_DIR}"

    clean_id = sanitize_track_name(base_name)
    target_moises = paths.stems / clean_id
    target_moises.mkdir(parents=True, exist_ok=True)
    for filename in matching_stems.values():
        shutil.copy2(RENDERED_DIR / filename, target_moises / filename)
        log.info("[%s] Imported stem %s -> %s", clean_id, filename, target_moises)

    invalidate_track_outputs(paths, clean_id)
    run_pipeline_cycle(paths, preset=preset, ffmpeg_bin=ffmpeg_bin, include_inbox=False)
    return True, clean_id


def run_pipeline_cycle(
    paths: pipeline_automator.PipelinePaths,
    preset: str,
    ffmpeg_bin: str = "ffmpeg",
    include_inbox: bool = True,
) -> None:
    """Execute pipeline stages sequentially with stage activity telemetry. Caller holds PROCESSING_LOCK."""
    if include_inbox and pipeline_automator.pending_inbox(paths):
        set_activity(True, "Stage 1/2: Routing inbox / Splitting Stems (Demucs)...")
        pipeline_automator.process_inbox(paths)

    if pipeline_automator.pending_stem_tracks(paths):
        set_activity(True, "Stage 2: Tonal Stem Prep & Triggers...")
        pipeline_automator.run_stem_prep(paths, preset=preset)

    if pipeline_automator.pending_midi_tracks(paths):
        set_activity(True, "Stage 3/4: Generating MIDI & BPM/Key...")
        pipeline_automator.generate_midi_and_metadata(paths, preset=preset)

    for track in pending_rough_mix(paths):
        set_activity(True, f"Generating Rough Mix & QA for {track}...")
        generate_rough_mix_wav(paths, track, ffmpeg_bin=ffmpeg_bin)

    if AUTO_HUMANIZE:
        for track in humanized_mix.pending_humanized(paths):
            set_activity(True, f"Rendering Humanized Mix for {track}...")
            humanized_mix.run_humanized(paths, track, ffmpeg_bin=ffmpeg_bin)

    if pipeline_automator.pending_mix_renders(paths):
        set_activity(True, "Stage 6: Running Mix QA Analyzer...")
        pipeline_automator.process_mix_renders(paths, ffmpeg_bin=ffmpeg_bin)


# --------------------------------------------------------------------------
# Background Watcher Thread
# --------------------------------------------------------------------------

class WatcherThread(threading.Thread):
    """Background polling watcher thread checking pipeline folders."""

    def __init__(self, paths: pipeline_automator.PipelinePaths, ffmpeg_bin: str = "ffmpeg") -> None:
        super().__init__(daemon=True, name="PipelineWatcherThread")
        self.paths = paths
        self.ffmpeg_bin = ffmpeg_bin
        self.stop_event = threading.Event()

    def run(self) -> None:
        log.info("Background Watcher Thread active (poll interval: %.1fs).", POLL_INTERVAL)
        while not self.stop_event.is_set():
            if WATCHER_ENABLED and not IS_BUSY:
                try:
                    task_desc = has_pending_work(self.paths)
                except Exception as exc:
                    log.error("Watcher scan error: %s", exc, exc_info=True)
                    task_desc = None
                if task_desc is not None and PROCESSING_LOCK.acquire(blocking=False):
                    try:
                        set_activity(True, task_desc)
                        run_pipeline_cycle(self.paths, preset=ACTIVE_PRESET, ffmpeg_bin=self.ffmpeg_bin, include_inbox=True)
                    except Exception as exc:
                        log.error("Watcher cycle error: %s", exc, exc_info=True)
                    finally:
                        set_activity(False, "Idle")
                        PROCESSING_LOCK.release()

            self.stop_event.wait(POLL_INTERVAL)

        log.info("Background Watcher Thread cleanly terminated.")

    def stop(self) -> None:
        self.stop_event.set()


# --------------------------------------------------------------------------
# HTTP Request Handler
# --------------------------------------------------------------------------

def _hostname(netloc: str) -> str:
    try:
        return (urllib.parse.urlsplit("//" + netloc).hostname or "").lower()
    except ValueError:
        return ""


class PipelineRequestHandler(BaseHTTPRequestHandler):
    """REST API & Audio Streaming HTTP Request Handler."""

    server_paths: pipeline_automator.PipelinePaths
    ffmpeg_bin: str

    def log_message(self, format: str, *args: Any) -> None:
        """Route access logs to debug level instead of the console."""
        log.debug("%s - - [%s] %s", self.client_address[0], self.log_date_time_string(), format % args)

    # ----------------------------------------------------------------------
    # Request guards
    # ----------------------------------------------------------------------

    def _request_allowed(self) -> bool:
        """Reject DNS-rebinding (foreign Host) and cross-site (foreign Origin) requests."""
        host = self.headers.get("Host", "")
        hostname = _hostname(host)
        if hostname not in LOOPBACK_HOSTNAMES and hostname not in EXTRA_ALLOWED_HOSTNAMES:
            self.send_json_response({"status": "error", "message": f"Host '{host}' not allowed"}, status=HTTPStatus.FORBIDDEN)
            return False
        origin = self.headers.get("Origin")
        if origin is not None:
            origin_netloc = urllib.parse.urlsplit(origin).netloc.lower() if origin != "null" else "null"
            if origin_netloc != host.lower():
                log.warning("Blocked cross-origin %s %s from Origin %s", self.command, self.path, origin)
                self.send_json_response({"status": "error", "message": "Cross-origin request blocked"}, status=HTTPStatus.FORBIDDEN)
                return False
        return True

    def send_json_response(self, data: Any, status: int = HTTPStatus.OK, head_only: bool = False) -> None:
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def do_HEAD(self) -> None:
        self.do_GET(head_only=True)

    # ----------------------------------------------------------------------
    # GET Endpoints
    # ----------------------------------------------------------------------

    def do_GET(self, head_only: bool = False) -> None:
        if not self._request_allowed():
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/favicon.ico":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return

        if path in ("/", "/index.html"):
            ui_index = SCRIPT_DIR / "ui" / "index.html"
            if not ui_index.is_file():
                ui_index = self.server_paths.automation / "ui" / "index.html"
            if not ui_index.is_file():
                self.send_error(HTTPStatus.NOT_FOUND, "UI not found")
                return
            body = ui_index.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("X-Frame-Options", "DENY")
            self.end_headers()
            if not head_only:
                self.wfile.write(body)
            return

        if path == "/api/status":
            with _STATE_LOCK:
                busy, task, queued = IS_BUSY, CURRENT_TASK, QUEUED_JOBS
            self.send_json_response({
                "watcher_running": WATCHER_ENABLED,
                "auto_humanize": AUTO_HUMANIZE,
                "pid": os.getpid(),
                "preset": ACTIVE_PRESET,
                "poll_interval": POLL_INTERVAL,
                "is_busy": busy,
                "current_task": task,
                "queued_jobs": queued,
                "counts": get_pipeline_counts(self.server_paths),
                "logs": get_recent_logs(self.server_paths.logs / "pipeline.log", max_lines=60),
            }, head_only=head_only)
            return

        if path == "/api/tracks":
            self.send_json_response(discover_tracks(self.server_paths), head_only=head_only)
            return

        if path in ("/api/audio", "/api/download"):
            rel_param = query.get("path", [""])[0]
            if not rel_param:
                self.send_error(HTTPStatus.BAD_REQUEST, "Missing 'path' parameter")
                return
            safe, abs_target = is_safe_path(self.server_paths.base, rel_param)
            if not safe or abs_target is None:
                self.send_error(HTTPStatus.FORBIDDEN, "Access denied: Path outside pipeline sandbox")
                return
            if not abs_target.is_file():
                self.send_error(HTTPStatus.NOT_FOUND, "File not found")
                return
            if path == "/api/audio":
                self.stream_audio_file(abs_target, head_only=head_only)
            else:
                self.send_download(abs_target, head_only=head_only)
            return

        self.send_error(HTTPStatus.NOT_FOUND, f"Endpoint {path} not found")

    def send_download(self, abs_target: Path, head_only: bool = False) -> None:
        mime_types = {
            ".wav": "audio/wav", ".mid": "audio/midi", ".midi": "audio/midi", ".json": "application/json",
            ".md": "text/markdown", ".txt": "text/plain", ".flp": "application/octet-stream",
        }
        ctype = mime_types.get(abs_target.suffix.lower(), "application/octet-stream")
        safe_name = re.sub(r'[^A-Za-z0-9._ ()-]', "_", abs_target.name)
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(abs_target.stat().st_size))
        self.send_header("Content-Disposition", f'attachment; filename="{safe_name}"')
        self.end_headers()
        if not head_only:
            try:
                with open(abs_target, "rb") as f:
                    shutil.copyfileobj(f, self.wfile, length=64 * 1024)
            except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError, OSError):
                pass

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
            self.end_headers()
            return

        raw_start, raw_end = m.group(1), m.group(2)
        if raw_start and raw_end:
            start, end = int(raw_start), int(raw_end)
        elif raw_start:
            start, end = int(raw_start), file_size - 1
        elif raw_end:
            start, end = max(0, file_size - int(raw_end)), file_size - 1
        else:
            start, end = 0, file_size - 1

        if start > end or start >= file_size:
            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Content-Range", f"bytes */{file_size}")
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
        self.end_headers()
        if head_only:
            return

        with open(abs_path, "rb") as f:
            f.seek(start)
            bytes_left = chunk_len
            while bytes_left > 0:
                data = f.read(min(64 * 1024, bytes_left))
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

    def _track_param(self, body_json: Dict[str, Any]) -> Optional[str]:
        """Validate a 'track' parameter: must be a single plain folder name."""
        track = str(body_json.get("track", "")).strip()
        if not track or track in (".", "..") or "/" in track or "\\" in track or "\x00" in track:
            self.send_json_response({"status": "error", "message": "Missing or invalid 'track' parameter"}, status=HTTPStatus.BAD_REQUEST)
            return None
        return track

    def do_POST(self) -> None:
        global WATCHER_ENABLED, ACTIVE_PRESET, AUTO_HUMANIZE

        if not self._request_allowed():
            return
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            content_length = -1
        if content_length < 0:
            self.send_json_response({"status": "error", "message": "Invalid Content-Length"}, status=HTTPStatus.BAD_REQUEST)
            return
        content_type = self.headers.get("Content-Type", "").split(";")[0].strip().lower()

        if path == "/api/upload":
            self._handle_upload(query, content_length, content_type)
            return

        # All other endpoints take JSON. Requiring the JSON content type means a
        # cross-site "simple" request (text/plain, forms) can never reach them.
        if content_type != "application/json":
            self.close_connection = True
            self.send_json_response({"status": "error", "message": "Content-Type must be application/json"}, status=HTTPStatus.UNSUPPORTED_MEDIA_TYPE)
            return
        if content_length > 1024 * 1024:
            self.close_connection = True
            self.send_json_response({"status": "error", "message": "Request body too large"}, status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return

        body_bytes = self.rfile.read(content_length) if content_length > 0 else b""
        try:
            body_json = json.loads(body_bytes.decode("utf-8")) if body_bytes else {}
            if not isinstance(body_json, dict):
                raise ValueError("JSON body must be an object")
        except Exception as exc:
            self.send_json_response({"status": "error", "message": f"Invalid JSON: {exc}"}, status=HTTPStatus.BAD_REQUEST)
            return

        paths = self.server_paths
        ffmpeg_bin = self.ffmpeg_bin

        def preset_from_body() -> str:
            preset = body_json.get("preset", ACTIVE_PRESET)
            return preset if preset in pipeline_automator.PRESETS else ACTIVE_PRESET

        if path == "/api/watcher":
            if "running" in body_json:
                WATCHER_ENABLED = bool(body_json["running"])
            if "auto_humanize" in body_json:
                AUTO_HUMANIZE = bool(body_json["auto_humanize"])
            if body_json.get("preset") in pipeline_automator.PRESETS:
                ACTIVE_PRESET = body_json["preset"]
            log.info("Watcher state updated: running=%s, preset=%s, auto_humanize=%s", WATCHER_ENABLED, ACTIVE_PRESET, AUTO_HUMANIZE)
            self.send_json_response({"status": "ok", "watcher_running": WATCHER_ENABLED, "preset": ACTIVE_PRESET, "auto_humanize": AUTO_HUMANIZE})
            return

        if path == "/api/run-once":
            if body_json.get("preset") in pipeline_automator.PRESETS:
                ACTIVE_PRESET = body_json["preset"]
            if IS_BUSY:
                self.send_json_response({"status": "busy", "message": f"Processing already in progress: {CURRENT_TASK}"}, status=HTTPStatus.CONFLICT)
                return
            preset = ACTIVE_PRESET
            start_job("Manual pipeline pass", lambda: run_pipeline_cycle(paths, preset=preset, ffmpeg_bin=ffmpeg_bin, include_inbox=True))
            self.send_json_response({"status": "started", "message": "Pipeline run started in background", "preset": preset})
            return

        if path == "/api/reprocess":
            track = self._track_param(body_json)
            if track is None:
                return
            preset = preset_from_body()

            def reprocess() -> None:
                # Invalidate only after the lock is held, so the watcher can't
                # grab the track in between and process it with another preset.
                invalidate_track_outputs(paths, track)
                run_pipeline_cycle(paths, preset=preset, ffmpeg_bin=ffmpeg_bin, include_inbox=False)

            start_job(f"Re-processing track {track}...", reprocess)
            self.send_json_response({"status": "ok", "message": f"Re-processing {track} queued", "track": track, "preset": preset})
            return

        if path == "/api/import-rendered":
            base_name = str(body_json.get("base_name", "")).strip()
            if not base_name:
                self.send_json_response({"status": "error", "message": "Missing 'base_name'"}, status=HTTPStatus.BAD_REQUEST)
                return
            if base_name not in rendered_stem_groups():
                self.send_json_response({"status": "error", "message": f"No rendered stem set named '{base_name}'"}, status=HTTPStatus.NOT_FOUND)
                return
            preset = preset_from_body()
            start_job(f"Importing rendered stems for {sanitize_track_name(base_name)}...",
                      lambda: import_rendered_track(base_name, paths, preset=preset, ffmpeg_bin=ffmpeg_bin))
            self.send_json_response({"status": "ok", "message": f"Import queued for {base_name}", "base_name": base_name, "preset": preset})
            return

        if path == "/api/generate-rough-mix":
            track = self._track_param(body_json)
            if track is None:
                return
            if not (paths.prepped / track / "Audio_Stems").is_dir():
                self.send_json_response({"status": "error", "message": f"No prepped stems for {track}"}, status=HTTPStatus.NOT_FOUND)
                return
            start_job(f"Generating rough mix for {track}...", lambda: generate_rough_mix_wav(paths, track, ffmpeg_bin=ffmpeg_bin))
            self.send_json_response({"status": "ok", "message": f"Rough mix queued for {track}", "track": track})
            return

        if path == "/api/humanize":
            track = self._track_param(body_json)
            if track is None:
                return
            if not (paths.prepped / track / "MIDI" / ".midi_done").exists():
                self.send_json_response({"status": "error", "message": f"{track} has no MIDI yet; wait for stages 3/4 to finish"}, status=HTTPStatus.CONFLICT)
                return
            settings = humanized_mix.HumanizeSettings.from_dict(body_json.get("settings") or {})
            if body_json.get("new_take"):
                settings.seed = int.from_bytes(os.urandom(4), "big") & 0x7FFFFFFF
            start_job(f"Rendering Humanized Mix for {track}...",
                      lambda: humanized_mix.run_humanized(paths, track, settings, ffmpeg_bin=ffmpeg_bin))
            self.send_json_response({"status": "ok", "message": f"Humanized mix queued for {track}", "track": track, "settings": settings.to_dict()})
            return

        if path == "/api/clear-failure":
            track = self._track_param(body_json)
            if track is None:
                return
            reg = pipeline_automator.failures(paths)
            reg.clear(track=track)
            for suffix in pipeline_automator.RENDER_SUFFIXES:
                reg.clear(track=f"{track}{suffix}")
            self.send_json_response({"status": "ok", "message": f"Cleared failures for {track}; the watcher will retry"})
            return

        if path == "/api/open-flp":
            track = self._track_param(body_json)
            if track is None:
                return
            safe, abs_flp = is_safe_path(paths.fl_project, paths.fl_project / track / f"{track}.flp")
            if not safe or abs_flp is None or not abs_flp.is_file():
                self.send_json_response({"status": "error", "message": f"No FL project found for {track}"}, status=HTTPStatus.NOT_FOUND)
                return
            if not os.path.isfile(FL64_EXE):
                self.send_json_response({"status": "error", "message": f"FL64.exe not found at {FL64_EXE} (set FL_STUDIO_EXE)"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
                return
            try:
                subprocess.Popen([FL64_EXE, str(abs_flp)], shell=False)
                log.info("[%s] Launched FL Studio with %s", track, abs_flp)
                self.send_json_response({"status": "ok", "message": f"Launched FL Studio with {abs_flp.name}"})
            except Exception as exc:
                self.send_json_response({"status": "error", "message": f"Could not launch FL Studio: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if path == "/api/open-folder":
            rel_folder = str(body_json.get("rel_path", "")).strip()
            safe, abs_folder = is_safe_path(paths.base, rel_folder)
            if not safe or abs_folder is None:
                self.send_json_response({"status": "error", "message": "Unsafe folder path"}, status=HTTPStatus.FORBIDDEN)
                return
            if not abs_folder.is_dir():
                self.send_json_response({"status": "error", "message": "Folder does not exist yet"}, status=HTTPStatus.NOT_FOUND)
                return
            try:
                opener = ["explorer.exe"] if os.name == "nt" else (["open"] if sys.platform == "darwin" else ["xdg-open"])
                subprocess.Popen(opener + [str(abs_folder)], shell=False)
                self.send_json_response({"status": "ok", "path": str(abs_folder)})
            except Exception as exc:
                self.send_json_response({"status": "error", "message": f"Could not open folder: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self.send_error(HTTPStatus.NOT_FOUND, f"POST endpoint {path} not found")

    def _handle_upload(self, query: Dict[str, List[str]], content_length: int, content_type: str) -> None:
        """Handle raw binary streaming upload and backward-compatible JSON base64 upload."""
        if content_length > MAX_UPLOAD_BYTES * 4 // 3 + 4096:
            self.close_connection = True
            self.send_json_response({"status": "error", "message": "Upload exceeds 500 MB limit"}, status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return
        if content_type in SIMPLE_CONTENT_TYPES:
            self.close_connection = True
            self.send_json_response(
                {"status": "error", "message": "Send audio as application/octet-stream (or audio/*), or JSON with data_base64"},
                status=HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
            )
            return

        is_json_mode = content_type == "application/json" or (not content_type and "filename" not in query)
        decoded_json_bytes: Optional[bytes] = None

        if is_json_mode:
            body_bytes = self.rfile.read(content_length) if content_length > 0 else b""
            if not body_bytes:
                self.send_json_response({"status": "error", "message": "Empty request body"}, status=HTTPStatus.BAD_REQUEST)
                return
            try:
                body_json = json.loads(body_bytes.decode("utf-8"))
            except Exception as exc:
                self.send_json_response({"status": "error", "message": f"Invalid JSON payload: {exc}"}, status=HTTPStatus.BAD_REQUEST)
                return
            target = str(body_json.get("target") or query.get("target", ["inbox"])[0]).strip()
            track = str(body_json.get("track") or query.get("track", [""])[0]).strip()
            raw_filename = str(body_json.get("filename") or query.get("filename", [""])[0])
            if "data_base64" not in body_json:
                self.send_json_response({"status": "error", "message": "Missing 'data_base64' in JSON upload payload"}, status=HTTPStatus.BAD_REQUEST)
                return
            try:
                decoded_json_bytes = base64.b64decode(body_json["data_base64"])
            except Exception as exc:
                self.send_json_response({"status": "error", "message": f"Invalid base64 data: {exc}"}, status=HTTPStatus.BAD_REQUEST)
                return
            if len(decoded_json_bytes) > MAX_UPLOAD_BYTES:
                self.send_json_response({"status": "error", "message": "Decoded upload exceeds 500 MB limit"}, status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
                return
        else:
            if content_length > MAX_UPLOAD_BYTES:
                self.close_connection = True
                self.send_json_response({"status": "error", "message": "Upload exceeds 500 MB limit"}, status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
                return
            if content_length <= 0:
                self.send_json_response({"status": "error", "message": "Empty binary upload body"}, status=HTTPStatus.BAD_REQUEST)
                return
            target = str(query.get("target", ["inbox"])[0]).strip()
            track = str(query.get("track", [""])[0]).strip()
            raw_filename = str(query.get("filename", [""])[0])

        # Sanitize filename: strip null bytes, basename, strip remaining slashes
        sanitized = raw_filename.replace("\x00", "").strip()
        sanitized = os.path.basename(sanitized.replace("\\", "/"))
        sanitized = sanitized.replace("/", "").replace("\\", "").strip()
        if not sanitized or sanitized in (".", ".."):
            self.send_json_response({"status": "error", "message": "Missing or invalid filename"}, status=HTTPStatus.BAD_REQUEST)
            return

        ext = Path(sanitized).suffix.lower()
        if ext not in ALLOWED_UPLOAD_EXTENSIONS:
            self.send_json_response(
                {"status": "error", "message": f"Unsupported file format '{ext}'. Allowed: .wav, .mp3, .flac, .m4a, .ogg"},
                status=HTTPStatus.BAD_REQUEST,
            )
            return

        # Track names become folder names and appear in the UI: keep them to [A-Za-z0-9_]
        raw_stem = Path(sanitized).stem.strip()
        if not raw_stem or raw_stem in (".", ".."):
            self.send_json_response({"status": "error", "message": "Invalid filename stem"}, status=HTTPStatus.BAD_REQUEST)
            return
        stem_name = sanitize_track_name(raw_stem)

        paths = self.server_paths
        if target == "inbox":
            dest_dir = paths.inbox
        elif target == "moises":
            dest_dir = paths.stems / sanitize_track_name(track or stem_name)
        elif target == "renders":
            dest_dir = paths.renders
        else:
            self.send_json_response({"status": "error", "message": f"Invalid upload target '{target}'"}, status=HTTPStatus.BAD_REQUEST)
            return

        final_wav_path = dest_dir / f"{stem_name}.wav"
        safe_base, abs_base_target = is_safe_path(paths.base, final_wav_path)
        safe_dir, abs_dir_target = is_safe_path(dest_dir, final_wav_path.name)
        if not safe_base or not safe_dir or abs_base_target is None or abs_dir_target is None or abs_base_target != abs_dir_target:
            self.send_json_response({"status": "error", "message": "Unsafe destination file path"}, status=HTTPStatus.FORBIDDEN)
            return

        final_wav_path = abs_base_target
        dest_dir = final_wav_path.parent
        dest_dir.mkdir(parents=True, exist_ok=True)

        ts_ms = int(time.time() * 1000)
        tmp_in = dest_dir / f".upload_{ts_ms}_{stem_name}{ext}.tmp"
        tmp_wav = dest_dir / f".upload_{ts_ms}_{stem_name}.tmp.wav"

        try:
            if decoded_json_bytes is not None:
                tmp_in.write_bytes(decoded_json_bytes)
            else:
                remaining = content_length
                with open(tmp_in, "wb") as f:
                    while remaining > 0:
                        chunk = self.rfile.read(min(64 * 1024, remaining))
                        if not chunk:
                            raise EOFError("Client disconnected before upload completed")
                        f.write(chunk)
                        remaining -= len(chunk)

            if ext != ".wav":
                cmd = [self.ffmpeg_bin, "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
                       "-i", str(tmp_in), "-c:a", "pcm_s24le", str(tmp_wav)]
                res = subprocess.run(cmd, capture_output=True, text=True, shell=False, timeout=120, check=False)
                tmp_in.unlink(missing_ok=True)
                if res.returncode != 0 or not tmp_wav.is_file():
                    tmp_wav.unlink(missing_ok=True)
                    err_detail = (res.stderr or "").strip() or f"ffmpeg exit code {res.returncode}"
                    self.send_json_response({"status": "error", "message": f"Audio transcoding failed: {err_detail}"}, status=HTTPStatus.BAD_REQUEST)
                    return
            else:
                tmp_wav = tmp_in

            if target == "inbox":
                m = INBOX_STEM_PATTERN.match(final_wav_path.stem)
                if m:
                    track_name = m.group(1).strip()
                    (paths.stems / track_name / final_wav_path.name).unlink(missing_ok=True)
                else:
                    track_name = final_wav_path.stem
                    for old_wav in pipeline_automator.visible_wavs(paths.stems / track_name):
                        old_wav.unlink(missing_ok=True)
                invalidate_track_outputs(paths, track_name)
                pipeline_automator.failures(paths).clear("demucs", track_name)
                os.replace(tmp_wav, final_wav_path)
            elif target == "moises":
                track_name = sanitize_track_name(track or final_wav_path.stem)
                os.replace(tmp_wav, final_wav_path)
                invalidate_track_outputs(paths, track_name)
            else:  # renders
                track_name = render_track_name(final_wav_path.stem)
                os.replace(tmp_wav, final_wav_path)
                qa_report_path(final_wav_path).unlink(missing_ok=True)
                pipeline_automator.failures(paths).clear("mix_qa", final_wav_path.stem)

            final_size = final_wav_path.stat().st_size
            log.info("Uploaded %s -> %s (%d bytes, track=%s)", sanitized, final_wav_path, final_size, track_name)
            self.send_json_response({
                "status": "ok",
                "filename": final_wav_path.name,
                "track": track_name,
                "rel_path": rel(paths, final_wav_path),
                "size_bytes": final_size,
            })
        except subprocess.TimeoutExpired:
            tmp_in.unlink(missing_ok=True)
            tmp_wav.unlink(missing_ok=True)
            self.send_json_response({"status": "error", "message": "Audio transcoding timed out (120s limit)"}, status=HTTPStatus.REQUEST_TIMEOUT)
        except Exception as exc:
            tmp_in.unlink(missing_ok=True)
            tmp_wav.unlink(missing_ok=True)
            self.send_json_response({"status": "error", "message": f"Upload failed: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)


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
    parser.add_argument("--allow-host", action="append", default=[],
                        help="Extra hostname the dashboard may be reached by (e.g. a LAN IP when using --host 0.0.0.0). Repeatable.")
    parser.add_argument("--preset", choices=pipeline_automator.PRESETS, default="gentle", help="Default stem prep filter preset")
    parser.add_argument("--poll-interval", type=float, default=2.0, help="Watcher poll interval in seconds")
    parser.add_argument("--no-watcher", action="store_true", help="Start web dashboard with background watcher paused")
    parser.add_argument("--no-auto-humanize", action="store_true", help="Don't render a Humanized Mix automatically for new tracks")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="FFmpeg executable name or path")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable verbose debug logging")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    global WATCHER_ENABLED, ACTIVE_PRESET, POLL_INTERVAL, AUTO_HUMANIZE

    args = parse_args(argv)
    base_dir = Path(args.base_dir).expanduser().resolve()
    paths = pipeline_automator.PipelinePaths(base_dir)
    paths.ensure_dirs()

    setup_server_logging(paths.logs, verbose=args.verbose)
    log.info("================================================================")
    log.info("Starting Suno Music Pipeline Studio Dashboard Server...")
    log.info("Base Directory : %s", base_dir)
    log.info("Listening on   : http://%s:%d", args.host, args.port)
    log.info("Default Preset : %s", args.preset)
    log.info("Watcher Active : %s | Auto Humanize: %s", not args.no_watcher, not args.no_auto_humanize)
    log.info("================================================================")

    ACTIVE_PRESET = args.preset
    POLL_INTERVAL = args.poll_interval
    WATCHER_ENABLED = not args.no_watcher
    AUTO_HUMANIZE = not args.no_auto_humanize
    EXTRA_ALLOWED_HOSTNAMES.update(h.strip().lower() for h in args.allow_host if h.strip())
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        log.warning("Binding to %s exposes the dashboard to your network. It has no login; use --allow-host only on trusted networks.", args.host)

    handle_watcher_pid_handover(paths)
    atexit.register(cleanup_pids, paths)

    watcher_thread = WatcherThread(paths, ffmpeg_bin=args.ffmpeg)
    watcher_thread.start()

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
        log.info("Pipeline Studio Dashboard running. Open in browser: http://localhost:%d", args.port)
        server.serve_forever()
    except BaseException as exc:
        log.error("Fatal exception in server loop: %s", exc, exc_info=True)
        return 1
    finally:
        watcher_thread.stop()
        server.server_close()
        cleanup_pids(paths)
        log.info("Pipeline Studio Dashboard server exited cleanly.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
