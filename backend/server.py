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

import base64
import logging
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import unquote, urlparse

import httpx
import imageio_ffmpeg
import yt_dlp
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
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


# Common domain mirrors that yt-dlp's site-specific extractors don't recognize
# by TLD alone. Rewriting to the canonical host before extraction lets the
# per-site extractor (which has custom decryption / auth) kick in instead of
# the "generic" fallback.
DOMAIN_MIRRORS: Dict[str, str] = {
    "xhamster.desi": "xhamster.com",
    "xhamster2.com": "xhamster.com",
    "xhamster3.com": "xhamster.com",
    "en.xhamster.com": "xhamster.com",
    "hi.xhamster.desi": "xhamster.com",
    "youtube-nocookie.com": "youtube.com",
    "www.youtube-nocookie.com": "www.youtube.com",
    "m.youtube.com": "www.youtube.com",
    "music.youtube.com": "www.youtube.com",
}


def _rewrite_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    replacement = DOMAIN_MIRRORS.get(host.lower())
    if not replacement:
        return url
    new_netloc = replacement
    if parsed.port:
        new_netloc = f"{replacement}:{parsed.port}"
    return parsed._replace(netloc=new_netloc).geturl()


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


def _yt_extract_sync(url: str) -> tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Returns (info, last_error). One of them will be populated."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "nocheckcertificate": True,
        "extract_flat": False,
        "noplaylist": True,
        "socket_timeout": 15,
        "format": "best[protocol^=http]/best",
        "user_agent": USER_AGENT,
    }
    last_error: Optional[str] = None
    for candidate in (_rewrite_url(url), url):
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(candidate, download=False)
                if info and info.get("_type") == "playlist":
                    entries = info.get("entries") or []
                    info = entries[0] if entries else None
                if info:
                    return info, None
        except Exception as exc:
            last_error = str(exc)
            logging.info("yt-dlp extract failed for %s: %s", candidate, exc)
        if candidate == url:
            break
    return None, last_error


async def _yt_extract(url: str) -> tuple[Optional[Dict[str, Any]], Optional[str]]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(YT_EXECUTOR, _yt_extract_sync, url)


async def _probe_xhamster_flag(url: str) -> Optional[Dict[str, Any]]:
    """
    XHamster-specific extractor. yt-dlp's own extractor is currently broken
    for many videos because it assumes a `title` field inside
    `initials.videoModel` which the site no longer emits — so it never gets
    to the decipher stage. We do the same job locally:

      1. Fetch the desktop HTML.
      2. Parse `window.initials = {…}` from the page.
      3. Honor `videoEntity.isDownloadable == False` — that's the site
         explicitly saying "no downloads for this one".
      4. Otherwise pull `xplayerSettings.sources.hls.h264.url`, run yt-dlp's
         public `_ByteGenerator` decipher, and return the resulting HLS
         (m3u8) URL as a downloadable format.

    Returns either:
      - {"blocked": True, "reason": str}
      - {"info": {title, thumbnail, duration, formats: [VideoFormat…]}}
      - None (couldn't determine; fall through to generic yt-dlp error)
    """
    host = (urlparse(url).hostname or "").lower()
    if "xhamster" not in host and "xhms" not in host and "xhday" not in host and "xhvid" not in host:
        return None

    headers = {"User-Agent": USER_AGENT, "Accept": "text/html,*/*"}
    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=12.0, headers=headers
        ) as http:
            r = await http.get(_rewrite_url(url))
            if r.status_code >= 400:
                return None
            body = r.text
    except Exception:
        return None

    import json as _json

    m = re.search(r"window\.initials\s*=\s*(\{.+?\})\s*;\s*</script>", body, re.S)
    if not m:
        m = re.search(r"window\.initials\s*=\s*(\{.+?\})\s*;", body, re.S)
    if not m:
        return None
    try:
        data = _json.loads(m.group(1))
    except Exception:
        return None

    ve = data.get("videoEntity") or {}
    if ve.get("isGeoBlocked"):
        return {
            "blocked": True,
            "reason": "This video is geo-restricted by the site and can't be downloaded from this region.",
        }

    xp = ((data.get("xplayerSettings") or {}).get("sources") or {})
    hls_h264 = ((xp.get("hls") or {}).get("h264") or {})
    hls_cipher = hls_h264.get("url") or hls_h264.get("fallback")

    try:
        from yt_dlp.extractor.xhamster import _ByteGenerator  # type: ignore
    except Exception:
        return None

    def decipher(hex_string: str) -> Optional[str]:
        if not hex_string or not re.fullmatch(r"[0-9a-fA-F]{12,}", hex_string):
            return None
        try:
            byte_data = bytes.fromhex(hex_string)
            seed = int.from_bytes(byte_data[1:5], byteorder="little", signed=True)
            gen = _ByteGenerator(byte_data[0], seed)
            return bytearray(b ^ next(gen) for b in byte_data[5:]).decode("latin-1")
        except Exception:
            return None

    formats: List[VideoFormat] = []
    # Public backend URL for building HLS-proxy links the mobile client can hit.
    proxy_base = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or ""

    def _proxy(m3u8: str) -> str:
        """If we have a public backend URL, wrap the HLS stream in our
        remux endpoint so the client downloads a single MP4."""
        if not proxy_base:
            return m3u8
        return f"{proxy_base}/api/hls_stream?token={_encode_hls_ref(m3u8, referer='https://xhamster.com/')}"

    # Try each progressive quality first (usually a per-quality HLS manifest).
    for f in ((xp.get("standard") or {}).get("h264") or []):
        if not isinstance(f, dict):
            continue
        cipher = f.get("url") or f.get("fallback")
        if not cipher:
            continue
        media_url = decipher(cipher)
        if not media_url or not media_url.startswith("http"):
            continue
        quality = f.get("label") or f.get("quality") or ""
        if quality.lower() == "auto":
            # Skip the master "auto" variant — the per-quality entries are more
            # useful for a downloader.
            continue
        formats.append(
            VideoFormat(
                id=f"h264-{quality or 'auto'}",
                label=f"{quality} MP4" if quality else "MP4",
                ext="mp4",
                mime="video/mp4",
                size_bytes=None,
                url=_proxy(media_url),
                kind="video",
            )
        )

    # Fallback: master HLS playlist (auto quality)
    if not formats and hls_cipher:
        m3u8 = decipher(hls_cipher)
        if m3u8 and m3u8.startswith("http"):
            formats.append(
                VideoFormat(
                    id="hls-auto",
                    label=f"Best available ({ve.get('maxResolution') or 'HLS'})",
                    ext="mp4",
                    mime="video/mp4",
                    size_bytes=None,
                    url=_proxy(m3u8),
                    kind="video",
                )
            )

    if not formats:
        return None

    title = ve.get("title") or _title_from_filename(url) or host
    thumb = None
    thumbs = ve.get("thumbs") or {}
    if isinstance(thumbs, dict):
        # Prefer the highest-numbered frame available
        for key in sorted(thumbs.keys(), key=lambda k: int(k) if str(k).isdigit() else 0, reverse=True):
            v = thumbs.get(key)
            if isinstance(v, str) and v.startswith("http"):
                thumb = v
                break

    return {
        "info": {
            "title": title,
            "author": (ve.get("pornstarModels") or [{}])[0].get("name")
            if isinstance(ve.get("pornstarModels"), list) and ve.get("pornstarModels")
            else host,
            "duration": ve.get("duration"),
            "thumbnail": thumb,
            "formats": formats,
        }
    }


def _friendly_yt_error(raw: Optional[str], host: str) -> str:
    """Turn a yt-dlp exception message into something the user can act on."""
    if not raw:
        return (
            f"We couldn't find any downloadable video or audio at {host}. "
            "The page may be behind login, DRM-protected, geo-blocked, or "
            "removed."
        )
    lowered = raw.lower()
    if "no video formats found" in lowered:
        return (
            f"{host} loaded but the extractor couldn't find a playable stream. "
            "This usually means the site changed recently — try again in a "
            "few days after yt-dlp updates, or use a different source."
        )
    if "unsupported url" in lowered:
        return (
            f"{host} isn't supported. If it's a mirror, try the main site's "
            "URL. If the page has a share link, use that instead."
        )
    if "sign in" in lowered or "login" in lowered or "requires authentication" in lowered:
        return (
            f"{host} requires you to be signed in to view this video. This "
            "app doesn't support login-gated content."
        )
    if "private" in lowered or "premium" in lowered or "paid" in lowered:
        return f"This video on {host} is private or paid — it can't be downloaded."
    if "drm" in lowered or "widevine" in lowered:
        return "This video is DRM-protected and cannot be downloaded."
    if "geo" in lowered or "not available in your country" in lowered:
        return "This video is geo-restricted and blocked from this server's region."
    if "http error 4" in lowered or "unable to download webpage" in lowered:
        return (
            f"Couldn't reach {host}. Check the URL, your connection, or try "
            "again in a moment."
        )
    # Strip huge traces from the raw error
    short = raw.split(";")[0].strip()
    if len(short) > 160:
        short = short[:157] + "…"
    return f"Couldn't extract this video: {short}"


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
    info, yt_error = await _yt_extract(url)
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

    # 4) Site-specific extractor (currently XHamster) — either returns a real
    #    supported response by deciphering the site's encrypted stream URLs,
    #    honors the site's own `isDownloadable=false` flag, or falls through
    #    to the generic yt-dlp error message.
    xh = await _probe_xhamster_flag(url)
    if xh:
        if xh.get("info"):
            info_dict = xh["info"]
            fmts: List[VideoFormat] = info_dict["formats"]
            return AnalyzeResponse(
                supported=True,
                title=info_dict.get("title") or parsed.netloc,
                author=info_dict.get("author") or parsed.netloc,
                duration_sec=info_dict.get("duration"),
                thumbnail=info_dict.get("thumbnail"),
                mime=fmts[0].mime,
                size_bytes=fmts[0].size_bytes,
                formats=fmts,
                source_url=url,
            )
        if xh.get("blocked"):
            return AnalyzeResponse(
                supported=False,
                reason=xh["reason"],
                source_url=url,
            )

    return AnalyzeResponse(
        supported=False,
        reason=_friendly_yt_error(yt_error, parsed.netloc),
        mime=mime,
        source_url=url,
    )


FFMPEG_BIN = imageio_ffmpeg.get_ffmpeg_exe()


def _encode_hls_ref(url: str, referer: Optional[str] = None) -> str:
    """Pack an HLS URL (+ optional referer) into a URL-safe blob so the client
    can send it back to /api/hls_stream without needing to escape query args."""
    payload = url + ("\n" + referer if referer else "")
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def _decode_hls_ref(token: str) -> tuple[str, Optional[str]]:
    pad = "=" * (-len(token) % 4)
    raw = base64.urlsafe_b64decode(token + pad).decode()
    if "\n" in raw:
        url, ref = raw.split("\n", 1)
        return url, ref or None
    return raw, None


@api_router.get("/hls_stream")
async def hls_stream(token: str = Query(..., description="Base64 of the HLS URL")):
    """
    Remuxes an HLS (m3u8) stream to a progressive MP4 and streams the bytes
    back to the client. This lets the mobile app treat the download as a
    single HTTP file — no client-side HLS logic needed.
    """
    try:
        hls_url, referer = _decode_hls_ref(token)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid token") from None

    if not hls_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid HLS URL")

    headers_line = [f"User-Agent: {USER_AGENT}"]
    if referer:
        headers_line.append(f"Referer: {referer}")
    header_arg = "\r\n".join(headers_line) + "\r\n"

    cmd = [
        FFMPEG_BIN,
        "-loglevel", "error",
        "-headers", header_arg,
        "-i", hls_url,
        "-c", "copy",
        "-bsf:a", "aac_adtstoasc",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "-f", "mp4",
        "pipe:1",
    ]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        bufsize=0,
    )

    def iterate():
        try:
            assert proc.stdout is not None
            while True:
                chunk = proc.stdout.read(1 << 15)
                if not chunk:
                    break
                yield chunk
        finally:
            try:
                proc.terminate()
            except Exception:
                pass

    fname = re.sub(r"[^A-Za-z0-9._-]+", "_", (urlparse(hls_url).path.rsplit("/", 1)[-1] or "video"))
    if not fname.lower().endswith(".mp4"):
        fname = f"{fname}.mp4"
    return StreamingResponse(
        iterate(),
        media_type="video/mp4",
        headers={
            "Content-Disposition": f'attachment; filename="{fname}"',
            "Cache-Control": "no-store",
        },
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
