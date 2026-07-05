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

TIMEOUT = 30
MP4_URL = "https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4"
HTML_URL = "https://www.example.com/"


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
