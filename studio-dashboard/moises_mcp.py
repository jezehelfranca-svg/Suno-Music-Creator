#!/usr/bin/env python3
"""Moises Studio MCP Bridge for the Suno Music Pipeline Studio Dashboard.

Connects to a user's Moises Studio MCP endpoint via Streamable HTTP JSON-RPC 2.0
(never storing or hardcoding personal tokens in tracked files) to:
- Inspect live account, project, tracks, media stems, chords, sections, and patterns.
- Group Moises media items into importable stem sets.
- Export stems into 02_Moises_Stems/<Track>/ and run the full 6-stage pipeline.
- Push humanized/prepped MIDI patterns and BPM/key back into Moises Studio.
"""

from __future__ import annotations

import base64
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import tempfile
import threading
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple
import urllib.error
import urllib.parse
import urllib.request

import humanized_mix
import pipeline_automator

log = logging.getLogger("moises_mcp")

MOISES_CONFIG_FILENAME = "moises_mcp_config.json"
DEFAULT_USER_AGENT = "Suno-Pipeline-Moises-Bridge/1.0"
DEFAULT_ACCEPT = "application/json, text/event-stream"

STEM_SUFFIX_RE = re.compile(
    r"^(.*?)[ _.\-]+(vocals?|drums?|bass|other|instruments?|inst|guitar|piano|keys|synth|strings|percussion|no_vocals|instrumental|accompaniment)$",
    re.IGNORECASE,
)
AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac", ".m4a", ".ogg", ".aac", ".aiff"}
_MCP_TOKEN_PATH_RE = re.compile(r"(/mcp/)([A-Za-z0-9_-]{5,})")


def redact_mcp_text(text: str) -> str:
    """Mask any /mcp/<token> segments in logs or error strings."""
    if not text:
        return ""
    return _MCP_TOKEN_PATH_RE.sub(lambda m: f"{m.group(1)}****...{m.group(2)[-4:]}", str(text))


class MoisesMCPError(RuntimeError):
    """Raised when a Moises Studio MCP call fails or the bridge is offline."""

    def __init__(
        self,
        message: str,
        *,
        status_code: Optional[int] = None,
        offline: bool = False,
        code: Optional[int] = None,
    ) -> None:
        super().__init__(redact_mcp_text(str(message)))
        self.status_code = status_code
        self.offline = offline
        self.code = code


def sanitize_track_name(name: str) -> str:
    """Sanitize an arbitrary song/stem-set title into a clean folder identifier."""
    s = re.sub(r"\.(wav|mp3|flac|m4a|ogg|aac|aiff)$", "", name.strip(), flags=re.IGNORECASE)
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s)
    s = s.strip("_")
    return s or "Track"


def mask_mcp_url(url: Optional[str]) -> str:
    """Mask the secret token segment of a Moises MCP URL for safe display."""
    raw = (url or "").strip()
    if not raw:
        return ""
    try:
        parts = urllib.parse.urlsplit(raw)
        if not parts.scheme or not parts.netloc:
            return "****"
        segments = [seg for seg in parts.path.split("/") if seg]
        if segments:
            token = segments[-1]
            masked = f"****...{token[-4:]}" if len(token) > 4 else "****"
            new_path = "/" + "/".join(segments[:-1] + [masked])
        else:
            new_path = "/****"
        return urllib.parse.urlunsplit((parts.scheme, parts.netloc, new_path, "", ""))
    except Exception:
        return "****"


def config_path(paths: pipeline_automator.PipelinePaths) -> Path:
    """Return path to the local gitignored Moises MCP config JSON."""
    return paths.automation / MOISES_CONFIG_FILENAME


def load_moises_url(paths: Optional[pipeline_automator.PipelinePaths] = None) -> Optional[str]:
    """Resolve Moises MCP URL from MOISES_MCP_URL env var or moises_mcp_config.json."""
    env_url = os.environ.get("MOISES_MCP_URL", "").strip()
    if env_url:
        return env_url
    if paths is None:
        return None
    cfg_file = config_path(paths)
    if not cfg_file.is_file():
        return None
    try:
        data = json.loads(cfg_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    url = str(data.get("url", "")).strip()
    return url or None


def save_moises_url(paths: pipeline_automator.PipelinePaths, url: str) -> Path:
    """Validate and atomically save a Moises MCP URL to moises_mcp_config.json."""
    clean = (url or "").strip()
    if "*" in clean or "..." in clean:
        raise ValueError("Cannot save a masked MCP URL; paste the full Moises MCP URL")
    parsed = urllib.parse.urlsplit(clean)
    scheme = (parsed.scheme or "").lower()
    host = (parsed.hostname or "").lower()
    is_moises_https = scheme == "https" and host == "mcp.moises.ai"
    is_local_http = scheme == "http" and host in ("127.0.0.1", "localhost", "::1")
    path = parsed.path or ""
    token_part = path[len("/mcp/"):].strip("/") if path.startswith("/mcp/") else ""
    if not (is_moises_https or is_local_http) or not path.startswith("/mcp/") or not token_part:
        raise ValueError("Moises MCP URL must be https://mcp.moises.ai/mcp/<token>")
    cfg_file = config_path(paths)
    payload = json.dumps({"url": clean}, indent=2) + "\n"
    pipeline_automator.atomic_write_text(cfg_file, payload)
    return cfg_file


def _parse_sse_json(raw_text: str) -> Dict[str, Any]:
    """Extract the JSON-RPC response object from an SSE text/event-stream body."""
    candidates: List[Dict[str, Any]] = []
    data_lines: List[str] = []
    for line in raw_text.splitlines():
        if line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
        elif not line.strip() and data_lines:
            blob = "\n".join(data_lines).strip()
            data_lines.clear()
            if blob and blob != "[DONE]":
                try:
                    obj = json.loads(blob)
                    if isinstance(obj, dict):
                        candidates.append(obj)
                except ValueError:
                    pass
    if data_lines:
        blob = "\n".join(data_lines).strip()
        if blob and blob != "[DONE]":
            try:
                obj = json.loads(blob)
                if isinstance(obj, dict):
                    candidates.append(obj)
            except ValueError:
                pass
    for obj in reversed(candidates):
        if "result" in obj or "error" in obj:
            return obj
    if candidates:
        return candidates[-1]
    raise MoisesMCPError("Empty or unparseable SSE response from Moises MCP")


def _extract_tool_payload(result: Any) -> Dict[str, Any]:
    """Normalize an MCP tool result's structuredContent / content into a dict."""
    if not isinstance(result, dict):
        return {"value": result}

    sc = result.get("structuredContent")
    if isinstance(sc, dict):
        return sc
    if isinstance(sc, list):
        return {"items": sc}

    content = result.get("content")
    if isinstance(content, list):
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "text" and isinstance(item.get("text"), str):
                text = item["text"].strip()
                if text:
                    try:
                        parsed = json.loads(text)
                        if isinstance(parsed, dict):
                            return parsed
                        if isinstance(parsed, list):
                            return {"items": parsed}
                        return {"value": parsed}
                    except ValueError:
                        return {"text": text}
            if item.get("type") == "resource" and isinstance(item.get("resource"), dict):
                return item["resource"]
    return result


def _extract_list(payload: Dict[str, Any], *keys: str) -> List[Dict[str, Any]]:
    """Extract a list of dicts from varied MCP response wrapper shapes."""
    for key in (*keys, "items", "data", "results", "list", "value"):
        val = payload.get(key)
        if isinstance(val, list):
            return [x if isinstance(x, dict) else {"value": x} for x in val]
        if isinstance(val, dict):
            for sub_key in (*keys, "items", "data", "list"):
                sub = val.get(sub_key)
                if isinstance(sub, list):
                    return [x if isinstance(x, dict) else {"value": x} for x in sub]
    return []


def _extract_entity_id(payload: Dict[str, Any], *keys: str) -> Optional[str]:
    """Extract a string entity ID from primitive, flat dict, or nested MCP tool payloads."""
    if not isinstance(payload, dict):
        if isinstance(payload, (str, int)) and not isinstance(payload, bool):
            s = str(payload).strip()
            return s or None
        return None

    for key in (*keys, "id", "value", "text"):
        val = payload.get(key)
        if isinstance(val, (str, int)) and not isinstance(val, bool):
            s = str(val).strip()
            if s:
                return s

    for container_key in ("track", "pattern", "clip", "data", "result"):
        sub = payload.get(container_key)
        if isinstance(sub, dict):
            for key in (*keys, "id"):
                val = sub.get(key)
                if isinstance(val, (str, int)) and not isinstance(val, bool):
                    s = str(val).strip()
                    if s:
                        return s
        elif isinstance(sub, (str, int)) and not isinstance(sub, bool):
            s = str(sub).strip()
            if s:
                return s
    return None


def _stem_role_and_group(name: str, item: Dict[str, Any]) -> Tuple[str, str]:
    """Infer (group_name, stem_role) from a Moises media item."""
    explicit_group = str(
        item.get("groupName")
        or item.get("songName")
        or item.get("trackName")
        or item.get("album")
        or ""
    ).strip()
    explicit_stem = str(item.get("stemType") or item.get("stem") or item.get("role") or "").strip().lower()

    stem_base = re.sub(r"\.(wav|mp3|flac|m4a|ogg|aac|aiff)$", "", name.strip(), flags=re.IGNORECASE)
    m = STEM_SUFFIX_RE.match(stem_base)
    if m:
        inferred_group = m.group(1).strip(" _-.") or stem_base
        inferred_role = m.group(2).lower()
        if inferred_role in ("vocal",):
            inferred_role = "vocals"
        elif inferred_role in ("drum",):
            inferred_role = "drums"
        elif inferred_role in ("instrument", "inst"):
            inferred_role = "instruments"
        return explicit_group or inferred_group, explicit_stem or inferred_role

    return explicit_group or stem_base or "Moises_Track", explicit_stem or "stem"


def _is_audio_media_item(item: Dict[str, Any]) -> bool:
    """Return True when a media_list entry represents an audio file/stem."""
    mtype = str(item.get("type") or item.get("mediaType") or item.get("mimeType") or "").lower()
    name = str(item.get("name") or item.get("filename") or item.get("title") or "").strip()
    ext = Path(name).suffix.lower() if name else ""
    if "video" in mtype or "image" in mtype:
        return False
    if "audio" in mtype or mtype in ("stem", "track", "wav", "mp3"):
        return True
    if ext in AUDIO_EXTENSIONS:
        return True
    # Many Moises Studio stem items omit extension/mimeType and only carry stem name or duration
    if not mtype and name:
        return True
    return bool(item.get("duration") is not None or item.get("sampleRate") is not None)


def group_media_stem_sets(
    media_items: Sequence[Dict[str, Any]],
    paths: Optional[pipeline_automator.PipelinePaths] = None,
) -> List[Dict[str, Any]]:
    """Group media_list audio items into importable songs / stem-sets."""
    grouped: Dict[str, Dict[str, Any]] = {}
    for raw in media_items:
        if not isinstance(raw, dict) or not _is_audio_media_item(raw):
            continue
        media_id = str(raw.get("id") or raw.get("mediaId") or "").strip()
        name = str(raw.get("name") or raw.get("filename") or raw.get("title") or media_id or "stem").strip()
        group_name, role = _stem_role_and_group(name, raw)
        clean_id = sanitize_track_name(group_name)
        entry = grouped.setdefault(
            clean_id,
            {
                "track_name": group_name,
                "clean_id": clean_id,
                "stems": [],
                "media_items": [],
                "already_imported": (
                    ((paths.stems / clean_id).is_dir() or (paths.prepped / clean_id).is_dir())
                    if paths is not None
                    else False
                ),
            },
        )
        enriched = dict(raw)
        enriched["id"] = media_id
        enriched["name"] = name
        enriched["stem_role"] = role
        entry["media_items"].append(enriched)
        if role not in entry["stems"]:
            entry["stems"].append(role)

    out = list(grouped.values())
    for g in out:
        g["stem_count"] = len(g["media_items"])
        g["stems"].sort()
    out.sort(key=lambda g: g["track_name"].lower())
    return out


def _normalize_user(payload: Dict[str, Any]) -> Dict[str, Any]:
    src = payload.get("user") if isinstance(payload.get("user"), dict) else payload
    return {
        "name": str(src.get("name") or src.get("displayName") or src.get("username") or src.get("email") or "Moises User"),
        "plan": str(src.get("plan") or src.get("tier") or src.get("subscription") or "PRO"),
        "email": src.get("email"),
        "raw": src,
    }


def _normalize_project(payload: Dict[str, Any]) -> Dict[str, Any]:
    src = payload.get("project") if isinstance(payload.get("project"), dict) else payload
    return {
        "id": src.get("id") or src.get("projectId"),
        "name": str(src.get("name") or src.get("title") or "Untitled Project"),
        "bpm": src.get("bpm") or src.get("tempo"),
        "rootKey": src.get("rootKey") or src.get("key"),
        "timeSignature": src.get("timeSignature") or "4/4",
        "isOnline": src.get("isOnline", True),
        "raw": src,
    }


def _decode_b64(text: str) -> bytes:
    cleaned = re.sub(r"\s+", "", text)
    if cleaned.startswith("data:") and "," in cleaned:
        cleaned = cleaned.split(",", 1)[1]
    pad = (-len(cleaned)) % 4
    if pad:
        cleaned += "=" * pad
    try:
        return base64.b64decode(cleaned, validate=False)
    except Exception:
        return base64.urlsafe_b64decode(cleaned)


def _decode_exported_bytes(result: Dict[str, Any], payload: Dict[str, Any], timeout: float = 30.0) -> bytes:
    """Decode exported audio bytes from any MCP media_export response shape."""
    # 1. Inspect URL / data URI fields
    for container in (payload, result):
        if not isinstance(container, dict):
            continue
        for key in ("url", "downloadUrl", "signedUrl", "href", "dataUri"):
            val = container.get(key)
            if isinstance(val, str) and val.strip():
                s = val.strip()
                if s.startswith("data:"):
                    return _decode_b64(s)
                if s.startswith(("http://", "https://")):
                    req = urllib.request.Request(s, headers={"User-Agent": DEFAULT_USER_AGENT})
                    with urllib.request.urlopen(req, timeout=timeout) as resp:
                        return resp.read()

    # 2. Inspect binary / arrayBuffer / base64 fields
    for container in (payload, result):
        if not isinstance(container, dict):
            continue
        for key in ("arrayBuffer", "buffer", "data", "bytes", "base64", "audio", "content"):
            val = container.get(key)
            if isinstance(val, str) and val.strip():
                if val.strip().startswith(("http://", "https://")):
                    req = urllib.request.Request(val.strip(), headers={"User-Agent": DEFAULT_USER_AGENT})
                    with urllib.request.urlopen(req, timeout=timeout) as resp:
                        return resp.read()
                return _decode_b64(val)
            if isinstance(val, list) and all(isinstance(x, int) and 0 <= x <= 255 for x in val):
                return bytes(val)
            if isinstance(val, dict):
                if val.get("type") == "Buffer" and isinstance(val.get("data"), list):
                    return bytes(int(x) & 0xFF for x in val["data"])
                if val and all(k.isdigit() for k in val.keys()):
                    ordered = [int(val[str(i)]) & 0xFF for i in range(len(val))]
                    return bytes(ordered)

    # 3. Inspect MCP content array items (resource blob / audio / text)
    content = result.get("content") if isinstance(result, dict) else None
    if isinstance(content, list):
        for item in content:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "resource" and isinstance(item.get("resource"), dict):
                res = item["resource"]
                if isinstance(res.get("blob"), str) and res["blob"].strip():
                    return _decode_b64(res["blob"])
                if isinstance(res.get("text"), str) and res["text"].strip():
                    return _decode_b64(res["text"])
            if item.get("type") in ("audio", "binary") and isinstance(item.get("data"), str):
                return _decode_b64(item["data"])
            if item.get("type") == "text" and isinstance(item.get("text"), str):
                txt = item["text"].strip()
                if txt.startswith("data:"):
                    return _decode_b64(txt)
                if txt.startswith(("http://", "https://")):
                    req = urllib.request.Request(txt, headers={"User-Agent": DEFAULT_USER_AGENT})
                    with urllib.request.urlopen(req, timeout=timeout) as resp:
                        return resp.read()

    raise MoisesMCPError("media_export returned no decodable audio bytes or download URL")


def _format_moises_root_key(estimated_key: Optional[str]) -> Optional[str]:
    """Convert 'C Major' / 'A Minor' into Moises Studio rootKey notation ('C' / 'Am')."""
    if not estimated_key:
        return None
    parts = estimated_key.strip().split()
    if not parts:
        return None
    tonic = parts[0]
    mode = parts[1].lower() if len(parts) > 1 else ""
    if mode.startswith("min"):
        return tonic if tonic.endswith("m") else f"{tonic}m"
    return tonic


class MoisesMCPClient:
    """JSON-RPC 2.0 client for the Moises Studio MCP Streamable HTTP endpoint."""

    def __init__(self, url: str, timeout: float = 30.0) -> None:
        clean = (url or "").strip()
        if not clean:
            raise MoisesMCPError("Moises MCP URL is empty")
        self.url = clean
        self.timeout = float(timeout)
        self._req_id = 0
        self._lock = threading.Lock()
        self._session_id: Optional[str] = None

    def _next_id(self) -> int:
        with self._lock:
            self._req_id += 1
            return self._req_id

    def _call_tool_raw(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Execute JSON-RPC tools/call and return the raw MCP result object."""
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/call",
            "params": {
                "name": name,
                "arguments": arguments if arguments is not None else {},
            },
        }
        headers = {
            "Content-Type": "application/json",
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": DEFAULT_ACCEPT,
        }
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id

        req = urllib.request.Request(
            self.url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                sid = resp.headers.get("Mcp-Session-Id")
                if sid:
                    self._session_id = sid
                ctype = (resp.headers.get("Content-Type") or "").lower()
                raw_text = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace")
            msg = err_body.strip() or f"HTTP {exc.code} {exc.reason}"
            try:
                err_json = json.loads(err_body)
                if isinstance(err_json, dict) and err_json.get("error"):
                    msg = str(err_json["error"])
            except ValueError:
                pass
            offline = exc.code == 404 or "offline" in msg.lower()
            raise MoisesMCPError(msg, status_code=exc.code, offline=offline) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise MoisesMCPError(f"Moises MCP unreachable: {exc}", offline=True) from exc

        if "text/event-stream" in ctype or raw_text.lstrip().startswith(("event:", "data:")):
            rpc = _parse_sse_json(raw_text)
        else:
            try:
                rpc = json.loads(raw_text)
            except ValueError as exc:
                raise MoisesMCPError(f"Invalid JSON from Moises MCP ({name}): {exc}") from exc

        if not isinstance(rpc, dict):
            raise MoisesMCPError(f"Unexpected JSON-RPC response type for {name}")
        if "error" in rpc and rpc["error"] is not None:
            err = rpc["error"]
            err_msg = err.get("message") if isinstance(err, dict) else str(err)
            err_code = err.get("code") if isinstance(err, dict) else None
            raise MoisesMCPError(str(err_msg or f"MCP tool {name} failed"), code=err_code)

        result = rpc.get("result", rpc)
        if isinstance(result, dict) and result.get("isError"):
            parsed = _extract_tool_payload(result)
            msg = parsed.get("text") or parsed.get("error") or parsed.get("message") or f"Tool {name} returned isError"
            raise MoisesMCPError(str(msg))
        return result if isinstance(result, dict) else {"value": result}

    def call_tool(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Call a Moises Studio MCP tool and return its normalized JSON payload."""
        result = self._call_tool_raw(name, arguments)
        return _extract_tool_payload(result)

    def get_status_snapshot(self, paths: Optional[pipeline_automator.PipelinePaths] = None) -> Dict[str, Any]:
        """Collect account, active project, tracks, media, markers, patterns, and stem options."""
        user_raw = self.call_tool("user_info", {})
        project_raw = self.call_tool("project_get", {})
        tracks_raw = self.call_tool("track_list", {})
        media_raw = self.call_tool("media_list", {})

        def _optional_call(tool_name: str) -> Dict[str, Any]:
            try:
                return self.call_tool(tool_name, {})
            except MoisesMCPError as exc:
                if exc.offline or exc.status_code in (401, 403, 404):
                    raise
                log.debug("Optional Moises MCP tool %s failed: %s", tool_name, exc)
                return {}

        chords_raw = _optional_call("marker_chord_list")
        sections_raw = _optional_call("marker_section_list")
        patterns_raw = _optional_call("pattern_list")
        sep_options = _optional_call("compute_stemSeparation_options")

        tracks = _extract_list(tracks_raw, "tracks")
        media = _extract_list(media_raw, "media", "files")
        chords = _extract_list(chords_raw, "chords", "markers")
        sections = _extract_list(sections_raw, "sections", "markers")
        patterns = _extract_list(patterns_raw, "patterns")
        grouped = group_media_stem_sets(media, paths=paths)

        return {
            "connected": True,
            "configured": True,
            "offline": False,
            "masked_url": mask_mcp_url(self.url),
            "user": _normalize_user(user_raw),
            "project": _normalize_project(project_raw),
            "tracks": tracks,
            "media": media,
            "grouped_stem_sets": grouped,
            "chords": chords,
            "sections": sections,
            "patterns": patterns,
            "separation_options": sep_options,
        }

    def export_media_to_file(self, media_id: str, dest_path: Path) -> Path:
        """Export a Moises media item by ID and write its audio bytes atomically to dest_path."""
        if not media_id:
            raise MoisesMCPError("Missing mediaId for media_export")
        raw_result = self._call_tool_raw("media_export", {"input": {"mediaId": media_id, "type": "ArrayBuffer"}})
        payload = _extract_tool_payload(raw_result)
        audio_bytes = _decode_exported_bytes(raw_result, payload, timeout=self.timeout)
        if not audio_bytes:
            raise MoisesMCPError(f"Exported empty audio buffer for media {media_id}")
        pipeline_automator.atomic_write_bytes(dest_path, audio_bytes)
        return dest_path

    def pull_project_stems(
        self,
        paths: pipeline_automator.PipelinePaths,
        group_or_track_name: Optional[str] = None,
        preset: str = "gentle",
        ffmpeg_bin: str = "ffmpeg",
        run_pipeline: bool = True,
    ) -> Dict[str, Any]:
        """Export matching stems from Moises Studio into 02_Moises_Stems and run the local pipeline."""
        snapshot = self.get_status_snapshot(paths=paths)
        groups = snapshot.get("grouped_stem_sets") or []
        if not groups:
            raise MoisesMCPError("No audio stem sets found in active Moises Studio media_list")

        chosen = None
        if group_or_track_name:
            needle = group_or_track_name.strip().lower()
            needle_clean = sanitize_track_name(group_or_track_name).lower()
            for g in groups:
                if g["track_name"].lower() == needle or g["clean_id"].lower() == needle_clean:
                    chosen = g
                    break
            if chosen is None:
                for g in groups:
                    if needle in g["track_name"].lower() or needle_clean in g["clean_id"].lower():
                        chosen = g
                        break
            if chosen is None:
                raise MoisesMCPError(f"Stem set '{group_or_track_name}' not found in Moises Studio")
        else:
            chosen = groups[0]

        clean_track = chosen["clean_id"]
        dest_dir = paths.stems / clean_track
        dest_dir.mkdir(parents=True, exist_ok=True)

        exported_files: List[str] = []
        used_names: set[str] = set()
        for idx, item in enumerate(chosen["media_items"]):
            media_id = str(item.get("id") or "").strip()
            if not media_id:
                continue
            role = sanitize_track_name(str(item.get("stem_role") or f"stem_{idx+1}")).lower()
            wav_name = f"{clean_track}_{role}.wav"
            if wav_name in used_names:
                wav_name = f"{clean_track}_{role}_{idx+1}.wav"
            used_names.add(wav_name)
            dest_wav = dest_dir / wav_name

            with tempfile.TemporaryDirectory(dir=dest_dir) as tmp_dir:
                raw_tmp = Path(tmp_dir) / f"export_{idx}.bin"
                self.export_media_to_file(media_id, raw_tmp)
                head = raw_tmp.read_bytes()[:12]
                is_wav = head[:4] == b"RIFF" and head[8:12] == b"WAVE"
                if is_wav:
                    os.replace(raw_tmp, dest_wav)
                else:
                    wav_tmp = Path(tmp_dir) / wav_name
                    cmd = [
                        ffmpeg_bin, "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
                        "-i", str(raw_tmp), "-c:a", "pcm_s24le", str(wav_tmp),
                    ]
                    res = subprocess.run(cmd, capture_output=True, text=True, shell=False, timeout=120, check=False)
                    if res.returncode != 0 or not wav_tmp.is_file():
                        err_detail = (res.stderr or "").strip() or f"ffmpeg exit code {res.returncode}"
                        raise MoisesMCPError(f"Could not transcode Moises stem '{wav_name}': {err_detail}")
                    os.replace(wav_tmp, dest_wav)
            exported_files.append(wav_name)

        if not exported_files:
            raise MoisesMCPError(f"No exportable media IDs found for '{clean_track}'")

        studio_meta = {
            "source": "moises_mcp",
            "pulled_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "track": clean_track,
            "moises_group": chosen["track_name"],
            "project": snapshot.get("project"),
            "chords": snapshot.get("chords", []),
            "sections": snapshot.get("sections", []),
            "patterns": snapshot.get("patterns", []),
            "media_items": chosen["media_items"],
            "exported_files": exported_files,
        }
        meta_path = dest_dir / "moises_studio_metadata.json"
        pipeline_automator.atomic_write_text(meta_path, json.dumps(studio_meta, indent=2) + "\n")

        pipeline_automator.invalidate_track_outputs(paths, clean_track)

        if run_pipeline:
            pipeline_automator.run_stem_prep(paths, preset=preset)
            pipeline_automator.generate_midi_and_metadata(paths, preset=preset)
            humanized_mix.run_rough(paths, clean_track, ffmpeg_bin=ffmpeg_bin)
            humanized_mix.run_humanized(paths, clean_track, ffmpeg_bin=ffmpeg_bin)
            pipeline_automator.process_mix_renders(paths, ffmpeg_bin=ffmpeg_bin)

        return {
            "status": "ok",
            "track": clean_track,
            "exported_files": exported_files,
            "metadata_path": str(meta_path),
            "project": snapshot.get("project"),
        }

    def push_track_to_moises_studio(
        self,
        paths: pipeline_automator.PipelinePaths,
        track_name: str,
        include_humanized: bool = True,
        update_project: bool = True,
    ) -> Dict[str, Any]:
        """Push a local track's humanized/prepped MIDI and BPM/Key into Moises Studio."""
        prep_dir = paths.prepped / track_name
        midi_dir = prep_dir / "MIDI"
        if not midi_dir.is_dir():
            raise MoisesMCPError(f"No MIDI directory found for '{track_name}'")

        meta: Dict[str, Any] = {}
        meta_file = prep_dir / "track_metadata.json"
        if meta_file.is_file():
            try:
                meta = json.loads(meta_file.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                meta = {}

        candidates: List[Tuple[str, str, Path]] = []
        drum_hum = midi_dir / f"{track_name}_FPC_Drums_Humanized.mid"
        drum_raw = midi_dir / f"{track_name}_FPC_Drums.mid"
        drum_mid = drum_hum if (include_humanized and drum_hum.is_file()) else drum_raw
        if drum_mid.is_file():
            candidates.append(("drums", "FPC Drums", drum_mid))

        bass_hum = midi_dir / f"{track_name}_Bass_Humanized.mid"
        bass_raw = midi_dir / f"{track_name}_Bass.mid"
        bass_mid = bass_hum if (include_humanized and bass_hum.is_file()) else bass_raw
        if bass_mid.is_file():
            candidates.append(("bass", "Bass", bass_mid))

        if not candidates:
            raise MoisesMCPError(f"No drum or bass MIDI files found for '{track_name}'")

        parsed_parts: List[Tuple[str, str, Path, List[Dict[str, Any]], float]] = []
        midi_bpm = 120.0
        for role_key, role_label, mid_path in candidates:
            notes, first_bpm = humanized_mix.read_smf(mid_path)
            if first_bpm > 0:
                midi_bpm = first_bpm
            parsed_parts.append((role_key, role_label, mid_path, notes, first_bpm))

        bpm = float(meta.get("estimated_bpm") or midi_bpm or 120.0)
        root_key = _format_moises_root_key(meta.get("estimated_key"))

        project_updated = False
        if update_project:
            proj_input: Dict[str, Any] = {"bpm": round(bpm, 2)}
            if root_key:
                proj_input["rootKey"] = root_key
            self.call_tool("project_set", {"input": proj_input})
            project_updated = True

        created_tracks: List[Dict[str, Any]] = []
        created_patterns: List[Dict[str, Any]] = []
        created_clips: List[Dict[str, Any]] = []
        ticks_per_sec = (bpm / 60.0) * 960.0
        for role_key, role_label, mid_path, notes, _ in parsed_parts:
            tr_res = self.call_tool(
                "track_create",
                {"input": {"name": f"{track_name} {role_label}", "type": "midi"}},
            )
            track_id = _extract_entity_id(tr_res, "trackId", "id") or f"{track_name}_{role_key}"
            created_tracks.append({"role": role_key, "trackId": track_id, "name": f"{track_name} {role_label}"})

            pat_notes = [
                {
                    "position": max(0, int(round(float(n["start"]) * ticks_per_sec))),
                    "duration": max(1, int(round(float(n["dur"]) * ticks_per_sec))),
                    "pitch": max(0, min(127, int(n["pitch"]))),
                    "velocity": round(float(min(1.0, max(0.01, float(n["vel"])))), 4),
                }
                for n in notes
            ]
            pat_res = self.call_tool(
                "pattern_create",
                {
                    "input": {
                        "name": f"{track_name}_{role_key}",
                        "notes": pat_notes,
                    }
                },
            )
            pattern_id = _extract_entity_id(pat_res, "patternId", "id") or f"pat_{track_name}_{role_key}"
            clip_res = self.call_tool(
                "clip_create",
                {
                    "input": {
                        "type": "midi",
                        "trackId": track_id,
                        "patternId": pattern_id,
                        "position": 0,
                    }
                },
            )
            clip_id = _extract_entity_id(clip_res, "clipId", "id")

            created_patterns.append({
                "role": role_key,
                "trackId": track_id,
                "patternId": pattern_id,
                "clipId": clip_id,
                "midi_file": mid_path.name,
                "note_count": len(pat_notes),
                "response": pat_res,
            })
            created_clips.append({
                "role": role_key,
                "trackId": track_id,
                "patternId": pattern_id,
                "clipId": clip_id,
                "position": 0,
                "response": clip_res,
            })

        return {
            "status": "ok",
            "track": track_name,
            "bpm": round(bpm, 2),
            "root_key": root_key,
            "project_updated": project_updated,
            "created_tracks": created_tracks,
            "created_patterns": created_patterns,
            "created_clips": created_clips,
        }


def get_safe_status(
    paths: Optional[pipeline_automator.PipelinePaths] = None,
    timeout: float = 15.0,
) -> Dict[str, Any]:
    """Return Moises MCP status snapshot, or a safe offline/unconfigured dict."""
    url = load_moises_url(paths)
    if not url:
        return {
            "connected": False,
            "configured": False,
            "offline": False,
            "masked_url": "",
            "user": None,
            "project": None,
            "tracks": [],
            "media": [],
            "grouped_stem_sets": [],
            "chords": [],
            "sections": [],
            "patterns": [],
            "separation_options": {},
        }
    try:
        client = MoisesMCPClient(url, timeout=timeout)
        return client.get_status_snapshot(paths=paths)
    except MoisesMCPError as exc:
        return {
            "connected": False,
            "configured": True,
            "offline": exc.offline,
            "masked_url": mask_mcp_url(url),
            "error": str(exc),
            "user": None,
            "project": None,
            "tracks": [],
            "media": [],
            "grouped_stem_sets": [],
            "chords": [],
            "sections": [],
            "patterns": [],
            "separation_options": {},
        }
