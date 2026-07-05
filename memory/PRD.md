# VidVault — Product Requirements

## Summary
VidVault is a React Native (Expo) mobile app that lets users save direct media
files (video / audio) they are authorized to download. It intentionally does
**not** bypass DRM, paywalls, authentication or platform ToS. If a URL doesn't
resolve to a direct media file, the app tells the user it's unsupported.

- Frontend: Expo Router (SDK 54) + React Native
- Backend: FastAPI (`/api/analyze` – probes URLs via HEAD/Range GET)
- Storage: 100% local via AsyncStorage; downloads land in
  `FileSystem.documentDirectory/downloads/`
- Design language: "iOS-Native Clean" (Terracotta #D9534F on warm sand),
  light theme, bottom tab navigation.

## Screens
1. **Home** – URL input (paste/clear/analyze), clipboard hint, recent URLs,
   quick access to History / Favorites / Downloads.
2. **Analyze / Video Info** – Hero thumbnail, meta (size, mime, source),
   format picker, sticky Download CTA, favorite toggle.
3. **Downloads** – Search + status filter (All/Active/Completed/Failed),
   3-line rows with progress bar, %, speed, ETA. Row actions: pause / resume /
   cancel / retry / play / share / delete.
4. **Library** – Segmented control: History | Favorites. Search + delete.
5. **Settings** – Default resolution/format, max parallel downloads,
   Wi-Fi only, clipboard detection, auto-retry, clear caches, About,
   Privacy Policy.
6. **Player** – Full-screen `expo-video` player with rewind/forward 10s,
   play/pause, 0.5×–2× speed cycling, PiP, fullscreen.

## Backend
`POST /api/analyze` → `{ supported, title, author, mime, size_bytes, formats[], reason }`
- Only probes; never streams the media content itself.
- Classifies via MIME type & extension. Recognises mp4/mov/webm/mkv/m3u8/ogv
  for video, mp3/m4a/aac/wav/ogg/flac for audio.

## Legal Guarantees
- Cannot bypass DRM, authentication, or paywalls.
- No web scraping; HTML URLs return `supported: false` with a clear reason.
- No analytics, ads, or trackers.

## Deferred (not in v1)
- Batch download / share intent / native notifications
- Background download service beyond OS defaults
- Localization strings (i18n scaffolding only)
- Tablet-specific layouts (basic responsive only)
