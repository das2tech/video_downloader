"""
Video Downloader backend.

Only supports direct media URLs (mp4, m3u8, webm, mkv, mov, mp3, m4a, wav, ogg).
It does NOT bypass DRM, paywalls, or platform ToS. If the URL points to an HTML
page, /api/analyze responds with a clear "unsupported" message.
"""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import List, Optional
from urllib.parse import unquote, urlparse

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB (kept for future features; unused for MVP as history is client-side)
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Video Downloader API")
api_router = APIRouter(prefix="/api")


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

VIDEO_MIME_PREFIXES = ("video/",)
AUDIO_MIME_PREFIXES = ("audio/",)
STREAM_MIMES = {
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "application/octet-stream",
}


def _guess_from_url(url: str) -> tuple[Optional[str], Optional[str]]:
    """Return (ext, filename) from a URL path."""
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
    if m.startswith(VIDEO_MIME_PREFIXES):
        return "video"
    if m.startswith(AUDIO_MIME_PREFIXES):
        return "audio"
    if ext in VIDEO_EXTS:
        return "video"
    if ext in AUDIO_EXTS:
        return "audio"
    if m in STREAM_MIMES and ext in VIDEO_EXTS:
        return "video"
    return None


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

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
        ),
        "Accept": "*/*",
    }

    mime: Optional[str] = None
    size: Optional[int] = None

    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=15.0, headers=headers
        ) as http:
            # Try HEAD first
            try:
                r = await http.head(url)
                if r.status_code >= 400 or "content-type" not in r.headers:
                    raise RuntimeError("HEAD unhelpful")
                mime = r.headers.get("content-type")
                size_header = r.headers.get("content-length")
                size = int(size_header) if size_header and size_header.isdigit() else None
            except Exception:
                # Fallback: GET Range 0-0 to probe content-type
                probe_headers = dict(headers)
                probe_headers["Range"] = "bytes=0-0"
                r = await http.get(url, headers=probe_headers)
                mime = r.headers.get("content-type")
                # content-range: bytes 0-0/12345
                cr = r.headers.get("content-range")
                if cr and "/" in cr:
                    try:
                        size = int(cr.split("/")[-1])
                    except ValueError:
                        size = None
                else:
                    size_header = r.headers.get("content-length")
                    size = (
                        int(size_header)
                        if size_header and size_header.isdigit()
                        else None
                    )
    except httpx.HTTPError as exc:
        return AnalyzeResponse(
            supported=False,
            reason=f"Could not reach the URL: {exc.__class__.__name__}",
            source_url=url,
        )

    kind = _classify(mime, ext)

    if not kind:
        # Almost certainly HTML / unsupported website
        return AnalyzeResponse(
            supported=False,
            reason=(
                "This URL doesn't point to a direct media file. "
                "For legal and privacy reasons, this app only downloads "
                "direct media links (mp4, m3u8, webm, mp3, etc.) that you "
                "are authorized to save. Website scraping is not supported."
            ),
            mime=mime,
            source_url=url,
        )

    title = _title_from_filename(name) or parsed.netloc
    resolved_ext = ext or ("." + (mime.split("/")[-1].split(";")[0] if mime else "bin"))
    label = "Audio" if kind == "audio" else "Original quality"
    if kind == "video" and resolved_ext == ".m3u8":
        label = "HLS Stream (m3u8)"

    fmt = VideoFormat(
        id="original",
        label=label,
        ext=resolved_ext.lstrip("."),
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


# Include router
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
