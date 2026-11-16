#!/usr/bin/env python3
"""Stem prep tool: tonal cleanup of separated stems + drum trigger WAVs.

Takes stem folders produced by a stem splitter (e.g. Moises) and prepares
them for an FL Studio session:

* ``02_Moises_Stems/<Track>/*.wav``  (any case, e.g. ``Vocals.WAV``)
* -> ``03_Prepped_Stems/<Track>/Audio_Stems/<stem>_prep.wav``
* -> ``03_Prepped_Stems/<Track>/Drum_Triggers/<drumstem>_{Kick,Snare,Hat}_Trigger.wav``
* -> ``03_Prepped_Stems/<Track>/.done``  (written only when every stem succeeded)
* -> ``04_FL_Project/<Track>/<Track>.flp`` (copied from ``Templates/Project_Template.flp``)

The processing is purely tonal (high-pass / low-pass / shelf / EQ). The source
sample rate is preserved and output is 24-bit PCM WAV.

Usage::

    python stem_prep.py [--base-dir DIR] [--once | --watch] [--dry-run]
                        [--preset off|gentle|bright-tame] [--poll-interval SECS]

``watchdog`` is optional (``pip install -r requirements.txt``); without it,
``--watch`` falls back to polling every ``--poll-interval`` seconds.

Importing this module has no filesystem side effects; directories are only
created by :func:`main`.
"""

from __future__ import annotations

import argparse
import logging
import os
import queue
import shlex
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple

try:  # optional dependency, only used by --watch
    from watchdog.events import FileSystemEventHandler  # type: ignore
    from watchdog.observers import Observer  # type: ignore

    HAVE_WATCHDOG = True
except ImportError:  # pragma: no cover - depends on environment
    FileSystemEventHandler = object  # type: ignore[assignment,misc]
    Observer = None  # type: ignore[assignment]
    HAVE_WATCHDOG = False

log = logging.getLogger("stem_prep")

# --------------------------------------------------------------------------
# Constants
# --------------------------------------------------------------------------

DEFAULT_BASE_DIR = "C:/Music_Pipeline"
ENV_BASE_DIR = "MUSIC_PIPELINE_DIR"

PREP_SUFFIX = "_prep"
TRIGGER_SUFFIX = "_Trigger"
DONE_MARKER = ".done"
OUTPUT_CODEC = "pcm_s24le"

STEM_KINDS = ("vocals", "drums", "bass", "other")
PRESETS = ("off", "gentle", "bright-tame")
DEFAULT_PRESET = "gentle"

# Keywords used to classify a stem by filename. Checked in this order, so
# "bass drum" or "kick" is treated as drums, not bass.
_KIND_KEYWORDS: Tuple[Tuple[str, Tuple[str, ...]], ...] = (
    ("vocals", ("vocal", "vox", "voice", "singer", "acapella", "a_cappella")),
    ("drums", ("drum", "kick", "snare", "hihat", "hi-hat", "perc", "kit")),
    ("bass", ("bass", "808", "sub")),
)

# Tonal prep chains, per preset and stem kind. All of these are ordinary
# mixing choices; adjust to taste.
#
# gentle:
#   vocals - HPF 80 Hz removes rumble/handling noise below the voice;
#            1-pole LPF 18 kHz softens separation hash at the very top.
#   drums  - HPF 30 Hz removes sub-sonic energy; top end left open for cymbals.
#   bass   - HPF 30 Hz removes DC/sub rumble; no LPF so attack/harmonics stay.
#   other  - HPF 40 Hz cleans low-end build-up from pads/guitars; gentle
#            1-pole LPF 18 kHz.
#
# bright-tame (for stems that sound harsh or brittle up top):
#   vocals - HPF 90 Hz, -3 dB high shelf at 12 kHz, 2-pole LPF 15.5 kHz, and
#            a mild -2.5 dB dip at 4.6 kHz to soften sibilant/presence harshness.
#   drums  - HPF 30 Hz, -2 dB high shelf at 12 kHz, 1-pole LPF 16 kHz.
#   bass   - HPF 30 Hz, 2-pole LPF 15 kHz (little useful content up there).
#   other  - HPF 40 Hz, -3 dB high shelf at 12 kHz, 2-pole LPF 15.5 kHz.
_PREP_FILTERS: Dict[str, Dict[str, Optional[str]]] = {
    "off": {kind: None for kind in STEM_KINDS},
    "gentle": {
        "vocals": "highpass=f=80:poles=2,lowpass=f=18000:poles=1",
        "drums": "highpass=f=30:poles=2",
        "bass": "highpass=f=30:poles=2",
        "other": "highpass=f=40:poles=2,lowpass=f=18000:poles=1",
    },
    "bright-tame": {
        "vocals": (
            "highpass=f=90:poles=2,"
            "highshelf=f=12000:t=q:w=0.707:g=-3,"
            "lowpass=f=15500:poles=2,"
            "equalizer=f=4600:t=q:w=3.5:g=-2.5"
        ),
        "drums": (
            "highpass=f=30:poles=2,"
            "highshelf=f=12000:t=q:w=0.707:g=-2,"
            "lowpass=f=16000:poles=1"
        ),
        "bass": "highpass=f=30:poles=2,lowpass=f=15000:poles=2",
        "other": (
            "highpass=f=40:poles=2,"
            "highshelf=f=12000:t=q:w=0.707:g=-3,"
            "lowpass=f=15500:poles=2"
        ),
    },
}

# Drum trigger chains: isolate a band, level it with dynaudnorm so the gate
# threshold behaves the same on quiet and loud mixes, then gate out bleed.
# The result is meant for audio-to-MIDI / trigger plugins, not for listening.
_TRIGGER_NORMALIZE = "dynaudnorm=f=500:g=31:p=0.95:m=20"
_TRIGGER_GATE = "agate=threshold={thr}:ratio=20:attack=0.5:release={rel}:range=0.001"
TRIGGER_BANDS: Tuple[Tuple[str, str, float, int], ...] = (
    # (name, band filter, gate threshold (linear, post-normalize), release ms)
    ("Kick", "lowpass=f=120:poles=2", 0.12, 60),
    ("Snare", "bandpass=f=800:width_type=h:w=1200", 0.15, 60),
    ("Hat", "highpass=f=6500:poles=2", 0.10, 30),
)


# --------------------------------------------------------------------------
# Pure helpers
# --------------------------------------------------------------------------


def classify_stem(name: "str | os.PathLike[str]") -> str:
    """Return the stem kind ('vocals', 'drums', 'bass', 'other') for a filename."""
    stem = Path(name).stem.lower()
    for kind, words in _KIND_KEYWORDS:
        if any(w in stem for w in words):
            return kind
    return "other"


def is_generated_output(name: "str | os.PathLike[str]") -> bool:
    """True if a filename looks like one of this tool's own outputs."""
    stem = Path(name).stem.lower()
    return stem.endswith(PREP_SUFFIX.lower()) or stem.endswith(TRIGGER_SUFFIX.lower())


def is_source_wav(path: "str | os.PathLike[str]") -> bool:
    """True for ``*.wav`` (any case) that is not one of our own outputs."""
    p = Path(path)
    return (
        p.suffix.lower() == ".wav"
        and not p.name.startswith(".")
        and not is_generated_output(p)
    )


def find_source_wavs(folder: Path) -> List[Path]:
    """Source WAVs directly inside ``folder``, sorted by name."""
    try:
        entries = [p for p in folder.iterdir() if p.is_file() and is_source_wav(p)]
    except OSError:
        return []
    return sorted(entries, key=lambda p: p.name.lower())


def build_prep_filter(stem_kind: str, preset: str) -> Optional[str]:
    """Return the ffmpeg ``-af`` chain for a stem kind and preset (None = no filter)."""
    if preset not in _PREP_FILTERS:
        raise ValueError(f"unknown preset {preset!r}; choose from {', '.join(PRESETS)}")
    if stem_kind not in STEM_KINDS:
        raise ValueError(f"unknown stem kind {stem_kind!r}; choose from {', '.join(STEM_KINDS)}")
    return _PREP_FILTERS[preset][stem_kind]


def build_ffmpeg_cmd(
    input_wav: "str | os.PathLike[str]",
    output_wav: "str | os.PathLike[str]",
    audio_filter: Optional[str] = None,
    ffmpeg: str = "ffmpeg",
) -> List[str]:
    """ffmpeg command that writes 24-bit PCM WAV at the source sample rate."""
    cmd = [
        ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
        "-i", str(input_wav),
        "-map", "0:a:0",
    ]
    if audio_filter:
        cmd += ["-af", audio_filter]
    # No -ar: the source sample rate is kept.
    cmd += ["-c:a", OUTPUT_CODEC, str(output_wav)]
    return cmd


def build_trigger_filter(band: str, threshold: float, release_ms: int) -> str:
    return ",".join(
        [band, _TRIGGER_NORMALIZE, _TRIGGER_GATE.format(thr=threshold, rel=release_ms)]
    )


def trigger_output_path(drum_wav: Path, triggers_dir: Path, band_name: str) -> Path:
    return triggers_dir / f"{Path(drum_wav).stem}_{band_name}{TRIGGER_SUFFIX}.wav"


def build_trigger_cmds(
    drum_wav: "str | os.PathLike[str]",
    triggers_dir: "str | os.PathLike[str]",
    ffmpeg: str = "ffmpeg",
) -> List[Tuple[Path, List[str]]]:
    """(output path, ffmpeg command) for Kick/Snare/Hat triggers of one drum stem."""
    drum_wav = Path(drum_wav)
    triggers_dir = Path(triggers_dir)
    out: List[Tuple[Path, List[str]]] = []
    for name, band, thr, rel in TRIGGER_BANDS:
        dest = trigger_output_path(drum_wav, triggers_dir, name)
        out.append((dest, build_ffmpeg_cmd(drum_wav, dest, build_trigger_filter(band, thr, rel), ffmpeg)))
    return out


def format_cmd(cmd: Sequence[str]) -> str:
    if os.name == "nt":
        return subprocess.list2cmdline(list(cmd))
    return shlex.join(cmd)


def resolve_base_dir(cli_value: Optional[str], environ: Optional[Dict[str, str]] = None) -> Path:
    """--base-dir, else $MUSIC_PIPELINE_DIR, else C:/Music_Pipeline."""
    env = os.environ if environ is None else environ
    raw = cli_value or env.get(ENV_BASE_DIR) or DEFAULT_BASE_DIR
    return Path(raw).expanduser()


@dataclass(frozen=True)
class PipelinePaths:
    base: Path

    @property
    def inbox(self) -> Path:
        return self.base / "01_Suno_Inbox"

    @property
    def stems(self) -> Path:
        return self.base / "02_Moises_Stems"

    @property
    def prepped(self) -> Path:
        return self.base / "03_Prepped_Stems"

    @property
    def fl_project(self) -> Path:
        return self.base / "04_FL_Project"

    @property
    def renders(self) -> Path:
        return self.base / "05_Mix_Renders"

    @property
    def templates(self) -> Path:
        return self.base / "Templates"

    @property
    def template_flp(self) -> Path:
        return self.templates / "Project_Template.flp"

    def all_dirs(self) -> List[Path]:
        return [self.inbox, self.stems, self.prepped, self.fl_project, self.renders, self.templates]

    def ensure_dirs(self) -> None:
        for d in self.all_dirs():
            d.mkdir(parents=True, exist_ok=True)

    def track_out(self, track: str) -> Path:
        return self.prepped / track

    def done_marker(self, track: str) -> Path:
        return self.track_out(track) / DONE_MARKER


Snapshot = Dict[str, Tuple[int, int]]


def folder_snapshot(folder: Path) -> Optional[Snapshot]:
    """{filename: (size, mtime_ns)} for files directly in ``folder``; None if missing."""
    snap: Snapshot = {}
    try:
        with os.scandir(folder) as it:
            for entry in it:
                try:
                    if entry.is_file():
                        st = entry.stat()
                        snap[entry.name] = (st.st_size, st.st_mtime_ns)
                except OSError:
                    continue
    except OSError:
        return None
    return snap


def _snapshot_has_source(snap: Optional[Snapshot]) -> bool:
    return bool(snap) and any(is_source_wav(n) for n in snap)  # type: ignore[union-attr]


def wait_until_stable(
    folder: Path,
    settle_secs: float,
    timeout_secs: float,
    poll_secs: float = 0.5,
    clock: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], object] = time.sleep,
    should_stop: Callable[[], bool] = lambda: False,
) -> bool:
    """Block until ``folder`` has source WAVs and its files (names, sizes, mtimes)
    have not changed for ``settle_secs``. Returns False on timeout/stop/missing."""
    last = folder_snapshot(folder)
    stable_since = clock()
    deadline = stable_since + max(timeout_secs, 0.0)
    while True:
        if last is None or should_stop():
            return False
        now = clock()
        if _snapshot_has_source(last) and now - stable_since >= settle_secs:
            return True
        if now >= deadline:
            return False
        sleep(max(0.0, min(poll_secs, deadline - now)))
        cur = folder_snapshot(folder)
        if cur != last:
            last = cur
            stable_since = clock()


def pending_tracks(paths: PipelinePaths) -> List[Path]:
    """Track folders under 02_Moises_Stems that have no .done marker yet."""
    try:
        dirs = [d for d in paths.stems.iterdir() if d.is_dir() and not d.name.startswith(".")]
    except OSError:
        return []
    return sorted(
        (d for d in dirs if not paths.done_marker(d.name).exists()),
        key=lambda p: p.name.lower(),
    )


# --------------------------------------------------------------------------
# Processing
# --------------------------------------------------------------------------

Runner = Callable[..., "subprocess.CompletedProcess[str]"]


@dataclass
class TrackResult:
    track: str
    ok: List[Path] = field(default_factory=list)
    failed: List[Tuple[Path, str]] = field(default_factory=list)
    dry_run: bool = False
    # Source folder changed while we were processing: leave it pending so a
    # later settled pass picks up the new/updated stems.
    sources_changed: bool = False

    @property
    def success(self) -> bool:
        return not self.failed and not self.sources_changed and (bool(self.ok) or self.dry_run)


def _tail(text: str, lines: int = 15) -> str:
    return "\n".join((text or "").strip().splitlines()[-lines:])


class StemPrepper:
    """Processes track folders. Holds config; side effects only when called."""

    def __init__(
        self,
        paths: PipelinePaths,
        preset: str = DEFAULT_PRESET,
        dry_run: bool = False,
        ffmpeg: str = "ffmpeg",
        runner: Runner = subprocess.run,
        settle_secs: float = 5.0,
        settle_timeout: float = 600.0,
        out: Callable[[str], None] = print,
    ) -> None:
        if preset not in PRESETS:
            raise ValueError(f"unknown preset {preset!r}")
        self.paths = paths
        self.preset = preset
        self.dry_run = dry_run
        self.ffmpeg = ffmpeg
        self.runner = runner
        self.settle_secs = settle_secs
        self.settle_timeout = settle_timeout
        self.out = out
        self.stop_event = threading.Event()
        # Snapshot of folders whose last attempt did not finish (failed or
        # dry-run); they are retried only when their contents change.
        self._last_attempt: Dict[str, Optional[Snapshot]] = {}
        self._lock = threading.Lock()

    # -- single command ----------------------------------------------------
    def _run(self, cmd: List[str], dest: Path) -> Optional[str]:
        """Run one ffmpeg command. Returns None on success, else an error text."""
        if self.dry_run:
            self.out(format_cmd(cmd))
            return None
        try:
            proc = self.runner(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                errors="replace",
                check=False,
            )
        except OSError as exc:
            err = f"could not start ffmpeg: {exc}"
        else:
            if proc.returncode == 0:
                return None
            err = f"ffmpeg exited with code {proc.returncode}: {_tail(proc.stderr or '')}"
        try:
            if dest.exists():
                dest.unlink()  # don't leave a partial file behind
        except OSError:
            pass
        return err

    # -- one track -----------------------------------------------------------
    def process_track(self, track_dir: Path) -> TrackResult:
        track = track_dir.name
        result = TrackResult(track=track, dry_run=self.dry_run)
        out_root = self.paths.track_out(track)
        stems_out = out_root / "Audio_Stems"
        triggers_out = out_root / "Drum_Triggers"

        before = folder_snapshot(track_dir)
        sources = find_source_wavs(track_dir)
        if not sources:
            log.warning("[%s] no .wav stems found in %s", track, track_dir)
            return result

        log.info("[%s] preparing %d stem(s), preset=%s%s", track, len(sources),
                 self.preset, " (dry run)" if self.dry_run else "")
        if not self.dry_run:
            stems_out.mkdir(parents=True, exist_ok=True)

        for wav in sources:
            kind = classify_stem(wav)
            jobs: List[Tuple[Path, List[str]]] = []
            dest = stems_out / f"{wav.stem}{PREP_SUFFIX}.wav"
            jobs.append((dest, build_ffmpeg_cmd(wav, dest, build_prep_filter(kind, self.preset), self.ffmpeg)))
            if kind == "drums":
                if not self.dry_run:
                    triggers_out.mkdir(parents=True, exist_ok=True)
                jobs.extend(build_trigger_cmds(wav, triggers_out, self.ffmpeg))

            for dest, cmd in jobs:
                err = self._run(cmd, dest)
                if err is None:
                    result.ok.append(dest)
                    if not self.dry_run:
                        log.info("[%s]   ok   %s (%s)", track, dest.name, kind)
                else:
                    result.failed.append((dest, err))
                    log.error("[%s]   FAIL %s from %s\n%s", track, dest.name, wav.name, err)

        if self.dry_run:
            return result

        if folder_snapshot(track_dir) != before:
            result.sources_changed = True
            log.warning("[%s] source folder changed during processing; leaving it pending for another pass",
                        track)

        self._copy_template(track)
        if result.success:
            self.paths.done_marker(track).write_text(
                f"prepped {len(result.ok)} file(s) with preset {self.preset}\n", encoding="utf-8"
            )
            log.info("[%s] done -> %s", track, out_root)
        elif result.failed:
            log.error("[%s] %d output(s) failed; not marking done", track, len(result.failed))
        return result

    def _copy_template(self, track: str) -> None:
        template = self.paths.template_flp
        if not template.is_file():
            return
        dest = self.paths.fl_project / track / f"{track}.flp"
        if dest.exists():
            return
        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(template, dest)
            log.info("[%s] FL project created: %s", track, dest)
        except OSError as exc:
            log.error("[%s] could not copy FL template: %s", track, exc)

    # -- readiness + bookkeeping -------------------------------------------
    def handle_track(self, track_dir: Path) -> Optional[TrackResult]:
        """Wait for the folder to settle, then process it unless done/unchanged."""
        track = track_dir.name
        if not track_dir.is_dir() or self.paths.done_marker(track).exists():
            return None
        if not find_source_wavs(track_dir):
            # Nothing to wait for yet; a later event/poll re-queues the folder.
            # (Avoids an empty folder holding the single worker until timeout.)
            return None
        with self._lock:
            if track in self._last_attempt and self._last_attempt[track] == folder_snapshot(track_dir):
                return None  # previous attempt failed and nothing changed since
        if not wait_until_stable(
            track_dir, self.settle_secs, self.settle_timeout,
            sleep=self.stop_event.wait, should_stop=self.stop_event.is_set,
        ):
            if not self.stop_event.is_set():
                log.warning("[%s] folder not ready (no stable .wav files within %.0fs); skipping for now",
                            track, self.settle_timeout)
            return None
        snap = folder_snapshot(track_dir)
        result = self.process_track(track_dir)
        with self._lock:
            if result.success and not result.dry_run:
                self._last_attempt.pop(track, None)
            else:
                self._last_attempt[track] = snap
        return result

    def run_once(self) -> int:
        tracks = pending_tracks(self.paths)
        if not tracks:
            log.info("nothing to do in %s", self.paths.stems)
            return 0
        failures = 0
        for t in tracks:
            if not find_source_wavs(t):
                log.warning("[%s] no .wav stems yet; skipping", t.name)
                continue
            res = self.handle_track(t)
            if res is None or not res.success:
                failures += 1
        return 1 if failures else 0


# --------------------------------------------------------------------------
# Watch mode
# --------------------------------------------------------------------------


class TrackQueue:
    """De-duplicating work queue processed on a single worker thread, so the
    filesystem observer thread never blocks on readiness waits or ffmpeg."""

    def __init__(self, handler: Callable[[Path], object]) -> None:
        self._handler = handler
        self._q: "queue.Queue[Optional[Path]]" = queue.Queue()
        self._pending: set = set()
        self._lock = threading.Lock()
        self._thread = threading.Thread(target=self._loop, name="stem-prep-worker", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def submit(self, track_dir: Path) -> bool:
        key = str(track_dir)
        with self._lock:
            if key in self._pending:
                return False
            self._pending.add(key)
        self._q.put(track_dir)
        return True

    def stop(self, timeout: Optional[float] = None) -> None:
        self._q.put(None)
        if self._thread.is_alive():
            self._thread.join(timeout)

    def _loop(self) -> None:
        while True:
            item = self._q.get()
            if item is None:
                return
            with self._lock:
                self._pending.discard(str(item))
            try:
                self._handler(item)
            except Exception:  # keep the worker alive
                log.exception("unexpected error processing %s", item)


def track_dir_for_event(stems_root: Path, event_path: "str | os.PathLike[str]") -> Optional[Path]:
    """Map any path under 02_Moises_Stems to its top-level track folder."""
    try:
        rel = Path(event_path).resolve().relative_to(stems_root.resolve())
    except (ValueError, OSError):
        return None
    if not rel.parts or rel.parts[0].startswith("."):
        return None
    return stems_root / rel.parts[0]


def _make_watchdog_handler(stems_root: Path, work: TrackQueue):
    class _Handler(FileSystemEventHandler):  # type: ignore[misc,valid-type]
        def _submit(self, p) -> None:
            track = track_dir_for_event(stems_root, p)
            if track is not None:
                work.submit(track)

        def on_created(self, event):
            self._submit(event.src_path)

        def on_moved(self, event):
            self._submit(event.dest_path)

        def on_modified(self, event):
            if not event.is_directory:
                self._submit(event.src_path)

    return _Handler()


def run_watch(prepper: StemPrepper, poll_interval: float, use_watchdog: bool = True) -> int:
    paths = prepper.paths
    work = TrackQueue(prepper.handle_track)
    work.start()
    for t in pending_tracks(paths):  # startup scan
        work.submit(t)

    observer = None
    if use_watchdog and HAVE_WATCHDOG:
        observer = Observer()
        observer.schedule(_make_watchdog_handler(paths.stems, work), str(paths.stems), recursive=True)
        observer.start()
        log.info("watching %s (watchdog)", paths.stems)
    else:
        log.info("watching %s (polling every %.1fs; install watchdog for event-based watching)",
                 paths.stems, poll_interval)
    try:
        while True:
            time.sleep(poll_interval)
            if observer is None:
                for t in pending_tracks(paths):
                    work.submit(t)
    except KeyboardInterrupt:
        log.info("stopping...")
    finally:
        prepper.stop_event.set()
        if observer is not None:
            observer.stop()
            observer.join()
        work.stop(timeout=30)
    return 0


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def build_arg_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="stem_prep.py",
        description="Tonal prep of separated stems (24-bit WAV, source sample rate kept) "
                    "and Kick/Snare/Hat drum trigger WAVs.",
    )
    ap.add_argument("--base-dir", help=f"pipeline root (default: ${ENV_BASE_DIR} or {DEFAULT_BASE_DIR})")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--once", action="store_true", help="process pending folders and exit (default)")
    mode.add_argument("--watch", action="store_true", help="keep running and process new folders")
    ap.add_argument("--dry-run", action="store_true", help="print ffmpeg commands without running them")
    ap.add_argument("--preset", choices=PRESETS, default=DEFAULT_PRESET, help="tonal prep preset (default: gentle)")
    ap.add_argument("--poll-interval", type=float, default=5.0,
                    help="seconds between folder scans when watchdog is unavailable (default: 5)")
    ap.add_argument("--settle-secs", type=float, default=5.0,
                    help="folder must be unchanged this long before processing (default: 5)")
    ap.add_argument("--settle-timeout", type=float, default=600.0,
                    help="give up waiting for a folder to settle after this many seconds (default: 600)")
    ap.add_argument("--ffmpeg", default="ffmpeg", help="ffmpeg executable (default: ffmpeg on PATH)")
    ap.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    return ap


def main(argv: Optional[Sequence[str]] = None, runner: Runner = subprocess.run) -> int:
    args = build_arg_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-5s %(message)s",
        datefmt="%H:%M:%S",
    )
    if args.poll_interval <= 0:
        log.error("--poll-interval must be > 0")
        return 2

    ffmpeg = shutil.which(args.ffmpeg)
    if ffmpeg is None:
        if not args.dry_run:
            log.error("ffmpeg not found (looked for %r on PATH). Install ffmpeg and make sure "
                      "it is on PATH, or pass --ffmpeg /path/to/ffmpeg.", args.ffmpeg)
            return 2
        log.warning("ffmpeg not found on PATH; dry run continues")
        ffmpeg = args.ffmpeg

    paths = PipelinePaths(resolve_base_dir(args.base_dir))
    log.info("base dir: %s", paths.base)
    if not args.dry_run:
        try:
            paths.ensure_dirs()
        except OSError as exc:
            log.error("cannot create pipeline folders under %s: %s", paths.base, exc)
            return 2
    elif not paths.stems.is_dir():
        log.warning("%s does not exist (dry run: nothing created)", paths.stems)

    prepper = StemPrepper(
        paths,
        preset=args.preset,
        dry_run=args.dry_run,
        ffmpeg=ffmpeg,
        runner=runner,
        settle_secs=args.settle_secs,
        settle_timeout=args.settle_timeout,
    )
    if args.watch:
        return run_watch(prepper, args.poll_interval)
    return prepper.run_once()


if __name__ == "__main__":
    sys.exit(main())
