"""Tests for the Video Downloader backend (/api/analyze and /api/)."""
import os

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else None
if not BASE_URL:
    # Read from frontend .env fallback
    from pathlib import Path
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break

TIMEOUT = 45
MP4_URL = "https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4"
HTML_URL = "https://www.example.com/"
YOUTUBE_SHORT_URL = "https://youtu.be/PKKXh8S8Apk"


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestRoot:
    def test_root_message(self, api):
        r = api.get(f"{BASE_URL}/api/", timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        assert r.json() == {"message": "Video Downloader API"}


class TestAnalyze:
    def test_analyze_mp4_supported(self, api):
        r = api.post(f"{BASE_URL}/api/analyze", json={"url": MP4_URL}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["supported"] is True
        assert data["source_url"] == MP4_URL
        assert data["mime"] and "video/mp4" in data["mime"].lower()
        assert isinstance(data["size_bytes"], int) and data["size_bytes"] > 0
        assert isinstance(data["formats"], list) and len(data["formats"]) >= 1
        fmt = data["formats"][0]
        assert fmt["kind"] == "video"
        assert fmt["ext"].lower() in ("mp4",)
        assert fmt["url"] == MP4_URL

    def test_analyze_html_unsupported(self, api):
        r = api.post(f"{BASE_URL}/api/analyze", json={"url": HTML_URL}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["supported"] is False
        assert data.get("reason"), "reason must be present for unsupported URL"
        assert data["source_url"] == HTML_URL

    def test_analyze_missing_url(self, api):
        r = api.post(f"{BASE_URL}/api/analyze", json={"url": ""}, timeout=TIMEOUT)
        assert r.status_code == 400, r.text

    def test_analyze_missing_url_field(self, api):
        r = api.post(f"{BASE_URL}/api/analyze", json={}, timeout=TIMEOUT)
        # Pydantic returns 422 for missing required field
        assert r.status_code in (400, 422), r.text

    def test_analyze_unreachable_url(self, api):
        r = api.post(
            f"{BASE_URL}/api/analyze",
            json={"url": "https://this-domain-does-not-exist-xyz-987654321.example/video.mp4"},
            timeout=TIMEOUT,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["supported"] is False
        assert data.get("reason")

    def test_analyze_bad_scheme(self, api):
        r = api.post(f"{BASE_URL}/api/analyze", json={"url": "ftp://example.com/file.mp4"}, timeout=TIMEOUT)
        assert r.status_code == 400

    def test_analyze_xhamster_desi_friendly_error(self, api):
        """XHamster site-flag detector: reason must mention 'disabled downloads' and the title."""
        url = "https://hi.xhamster.desi/videos/8-9166610"
        r = api.post(f"{BASE_URL}/api/analyze", json={"url": url}, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["supported"] is False
        reason = data.get("reason") or ""
        assert reason, "reason must be present"
        # Must not leak raw yt-dlp traceback markers
        assert "Traceback" not in reason
        assert "yt_dlp." not in reason
        # Must be reasonably short (friendly message, not a dumped exception)
        assert len(reason) < 400, f"reason too long, looks like a raw dump: {reason}"
        # New _probe_xhamster_flag() assertions:
        assert "disabled downloads" in reason.lower(), (
            f"reason should indicate the site disabled downloads, got: {reason}"
        )
        assert "vintage mother 8" in reason.lower(), (
            f"reason should include the site's title 'Vintage mother 8', got: {reason}"
        )
        # Should take precedence over the generic yt-dlp friendly message
        assert "extractor couldn't find a playable stream" not in reason, (
            f"xhamster flag reason should take precedence over the generic yt-dlp message, got: {reason}"
        )

    def test_analyze_youtube_short_ytdlp(self, api):
        """yt-dlp path: YouTube short URL should resolve to supported=true with formats + audio."""
        r = api.post(f"{BASE_URL}/api/analyze", json={"url": YOUTUBE_SHORT_URL}, timeout=TIMEOUT)
        assert r.status_code == 200, r.text
        data = r.json()
        if not data.get("supported"):
            pytest.skip(f"yt-dlp couldn't resolve youtube from this environment: {data.get('reason')}")
        assert data["supported"] is True
        assert data["source_url"] == YOUTUBE_SHORT_URL
        assert data.get("title"), "title should be populated by yt-dlp"
        assert data.get("thumbnail"), "thumbnail should be populated by yt-dlp"
        # duration may be None on some extractors but should usually be present
        assert isinstance(data.get("formats"), list) and len(data["formats"]) >= 1
        kinds = {f["kind"] for f in data["formats"]}
        assert "video" in kinds, f"expected at least one video format, got kinds={kinds}"
        # At least one audio-only format expected for youtube
        assert "audio" in kinds, f"expected at least one audio format, got kinds={kinds}"
        # Every format must have a non-empty url
        for f in data["formats"]:
            assert f.get("url"), f"format missing url: {f}"

