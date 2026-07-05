"""
Video Downloader backend.

Supports two URL kinds:
1. Direct media URLs (mp4/m3u8/webm/mp3/…) → probed via HEAD/Range GET.
2. Website URLs (YouTube, Instagram, TikTok, Facebook, X, Reddit, Vimeo,
   SoundCloud, ~1000+ others) → resolved via yt-dlp.

Note: DRM-protected content is skipped by yt-dlp itself. If yt-dlp cannot
resolve a URL, we respond with a clear "unsupported" message.
"""

from __future__ import annotations

import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import unquote, urlparse

import httpx
import yt_dlp
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Video Downloader API")
api_router = APIRouter(prefix="/api")

# Small executor so yt-dlp probes don't block the event loop
YT_EXECUTOR = ThreadPoolExecutor(max_workers=4)


# -----------------------------
# Models
# -----------------------------


class AnalyzeRequest(BaseModel):
    url: str


class VideoFormat(BaseModel):
    id: str
    label: str
    ext: str
    mime: str
    size_bytes: Optional[int] = None
    url: str
    kind: str  # "video" | "audio"


class AnalyzeResponse(BaseModel):
    supported: bool
    reason: Optional[str] = None
    title: Optional[str] = None
    author: Optional[str] = None
    duration_sec: Optional[float] = None
    thumbnail: Optional[str] = None
    mime: Optional[str] = None
    size_bytes: Optional[int] = None
    formats: List[VideoFormat] = Field(default_factory=list)
    source_url: str


# -----------------------------
# Helpers
# -----------------------------

VIDEO_EXTS = {".mp4", ".m4v", ".mov", ".webm", ".mkv", ".m3u8", ".ts", ".ogv"}
AUDIO_EXTS = {".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"}
STREAM_MIMES = {
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "application/octet-stream",
}
USER_AGENT = (
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
)


def _guess_from_url(url: str) -> tuple[Optional[str], Optional[str]]:
    try:
        path = urlparse(url).path
        name = unquote(os.path.basename(path)) or None
        ext = os.path.splitext(name or "")[1].lower() or None
        return ext, name
    except Exception:
        return None, None


def _title_from_filename(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    base = os.path.splitext(name)[0]
    base = re.sub(r"[-_]+", " ", base).strip()
    return base or None


def _classify(mime: Optional[str], ext: Optional[str]) -> Optional[str]:
    m = (mime or "").lower().split(";")[0].strip()
    if m.startswith("video/"):
        return "video"
    if m.startswith("audio/"):
        return "audio"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in AUDIO_EXTS:
        return "audio"
    if m in STREAM_MIMES and ext in VIDEO_EXTS:
        return "video"
    return None


async def _probe_direct(url: str) -> tuple[Optional[str], Optional[int]]:
    """Return (mime, size_bytes) for a direct URL, or (None, None) on failure."""
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    async with httpx.AsyncClient(
        follow_redirects=True, timeout=12.0, headers=headers
    ) as http:
        try:
            r = await http.head(url)
            if r.status_code < 400 and "content-type" in r.headers:
                mime = r.headers.get("content-type")
                size_header = r.headers.get("content-length")
                size = int(size_header) if size_header and size_header.isdigit() else None
                return mime, size
        except Exception:
            pass
        try:
            probe_headers = dict(headers)
            probe_headers["Range"] = "bytes=0-0"
            r = await http.get(url, headers=probe_headers)
            mime = r.headers.get("content-type")
            cr = r.headers.get("content-range")
            size: Optional[int] = None
            if cr and "/" in cr:
                try:
                    size = int(cr.split("/")[-1])
                except ValueError:
                    size = None
            else:
                sh = r.headers.get("content-length")
                size = int(sh) if sh and sh.isdigit() else None
            return mime, size
        except Exception:
            return None, None


# -----------------------------
# yt-dlp path
# -----------------------------


def _yt_extract_sync(url: str) -> Optional[Dict[str, Any]]:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "nocheckcertificate": True,
        "extract_flat": False,
        "noplaylist": True,
        "socket_timeout": 15,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            # If it's a playlist, take the first entry
            if info and info.get("_type") == "playlist":
                entries = info.get("entries") or []
                info = entries[0] if entries else None
            return info
    except Exception as exc:
        logging.info("yt-dlp extract failed for %s: %s", url, exc)
        return None


async def _yt_extract(url: str) -> Optional[Dict[str, Any]]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(YT_EXECUTOR, _yt_extract_sync, url)


def _formats_from_ytdlp(info: Dict[str, Any]) -> List[VideoFormat]:
    formats: List[VideoFormat] = []
    all_fmts = info.get("formats") or []

    # Progressive (video + audio in one file) — best UX for the mobile
    # downloader because we don't need to mux.
    progressive: List[Dict[str, Any]] = []
    for f in all_fmts:
        if not f.get("url"):
            continue
        vcodec = f.get("vcodec") or "none"
        acodec = f.get("acodec") or "none"
        if vcodec != "none" and acodec != "none":
            progressive.append(f)

    # De-dup by height (keep highest bitrate)
    by_height: Dict[int, Dict[str, Any]] = {}
    for f in progressive:
        h = int(f.get("height") or 0)
        prev = by_height.get(h)
        if not prev or (f.get("tbr") or 0) > (prev.get("tbr") or 0):
            by_height[h] = f

    for h in sorted(by_height.keys(), reverse=True):
        f = by_height[h]
        ext = (f.get("ext") or "mp4").lstrip(".")
        label = f"{h}p {ext.upper()}" if h else f.get("format_note") or "Video"
        formats.append(
            VideoFormat(
                id=f"prog-{f.get('format_id') or h}",
                label=label,
                ext=ext,
                mime=f.get("mime_type") or f"video/{ext}",
                size_bytes=f.get("filesize") or f.get("filesize_approx"),
                url=f["url"],
                kind="video",
            )
        )

    # If nothing progressive (typical YouTube ≥1080p), expose the "best"
    # single-URL video the site can give us. This is often the best combined
    # HLS/DASH manifest yt-dlp resolved with format='best'.
    if not formats:
        top_url = info.get("url")
        if top_url:
            ext = (info.get("ext") or "mp4").lstrip(".")
            height = int(info.get("height") or 0)
            label = f"{height}p (best)" if height else "Best available"
            formats.append(
                VideoFormat(
                    id="best",
                    label=label,
                    ext=ext,
                    mime=f"video/{ext}",
                    size_bytes=info.get("filesize") or info.get("filesize_approx"),
                    url=top_url,
                    kind="video",
                )
            )

    # Best audio-only track
    audio_only = [
        f
        for f in all_fmts
        if f.get("url")
        and (f.get("acodec") and f["acodec"] != "none")
        and (not f.get("vcodec") or f["vcodec"] == "none")
    ]
    if audio_only:
        best_audio = max(audio_only, key=lambda x: x.get("abr") or 0)
        ext = (best_audio.get("ext") or "m4a").lstrip(".")
        formats.append(
            VideoFormat(
                id=f"audio-{best_audio.get('format_id') or 'best'}",
                label=f"Audio only ({ext.upper()})",
                ext=ext,
                mime=best_audio.get("mime_type") or f"audio/{ext}",
                size_bytes=best_audio.get("filesize") or best_audio.get("filesize_approx"),
                url=best_audio["url"],
                kind="audio",
            )
        )

    return formats


# -----------------------------
# Routes
# -----------------------------


@api_router.get("/")
async def root():
    return {"message": "Video Downloader API"}


@api_router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest):
    url = (req.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Only http(s) URLs are supported")

    ext, name = _guess_from_url(url)

    # 1) First, try treating this as a direct media URL. This is fastest
    #    and works for any user-authorized .mp4/.m3u8/.mp3 link.
    if ext in VIDEO_EXTS or ext in AUDIO_EXTS:
        mime, size = await _probe_direct(url)
        # Only trust the direct path when the probe actually succeeded.
        # Otherwise fall through to yt-dlp / unsupported response.
        kind = _classify(mime, ext) if (mime or size) else None
        if kind:
            title = _title_from_filename(name) or parsed.netloc
            resolved_ext = ext.lstrip(".") if ext else (
                (mime.split("/")[-1].split(";")[0] if mime else "bin")
            )
            label = (
                "Audio"
                if kind == "audio"
                else ("HLS Stream (m3u8)" if resolved_ext == "m3u8" else "Original quality")
            )
            fmt = VideoFormat(
                id="original",
                label=label,
                ext=resolved_ext,
                mime=(mime or "application/octet-stream").split(";")[0].strip(),
                size_bytes=size,
                url=url,
                kind=kind,
            )
            return AnalyzeResponse(
                supported=True,
                title=title,
                author=parsed.netloc,
                thumbnail=None,
                mime=fmt.mime,
                size_bytes=size,
                formats=[fmt],
                source_url=url,
            )

    # 2) Otherwise, delegate to yt-dlp (YouTube, Instagram, TikTok, FB, X,
    #    Reddit, Vimeo, SoundCloud… ~1000+ sites).
    info = await _yt_extract(url)
    if info:
        formats = _formats_from_ytdlp(info)
        if formats:
            return AnalyzeResponse(
                supported=True,
                title=info.get("title") or _title_from_filename(name) or parsed.netloc,
                author=info.get("uploader") or info.get("channel") or parsed.netloc,
                duration_sec=info.get("duration"),
                thumbnail=info.get("thumbnail"),
                mime=formats[0].mime,
                size_bytes=formats[0].size_bytes,
                formats=formats,
                source_url=url,
            )

    # 3) Last-ditch: maybe it's a direct file the URL didn't hint at
    mime, size = await _probe_direct(url)
    kind = _classify(mime, ext) if (mime or size) else None
    if kind:
        title = _title_from_filename(name) or parsed.netloc
        resolved_ext = (ext or ("." + (mime or "").split("/")[-1].split(";")[0])).lstrip(".")
        fmt = VideoFormat(
            id="original",
            label="Original quality" if kind == "video" else "Audio",
            ext=resolved_ext or "bin",
            mime=(mime or "application/octet-stream").split(";")[0].strip(),
            size_bytes=size,
            url=url,
            kind=kind,
        )
        return AnalyzeResponse(
            supported=True,
            title=title,
            author=parsed.netloc,
            mime=fmt.mime,
            size_bytes=size,
            formats=[fmt],
            source_url=url,
        )

    return AnalyzeResponse(
        supported=False,
        reason=(
            "We couldn't find any downloadable video or audio at this URL. "
            "This can happen if the content is DRM-protected, requires login, "
            "was removed, or the site isn't supported."
        ),
        mime=mime,
        source_url=url,
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
