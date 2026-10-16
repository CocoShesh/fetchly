# Interface tools update

Fetchly now includes exact source-format controls, muted/video-only output, browser-local download history with retry, selective batch retries, broader gallery-dl support, byte-range file transfers, and admin-only staged engine updates. See [FEATURES.md](FEATURES.md) for operation, configuration, and coverage.

# Latest feature update

See [FEATURES.md](FEATURES.md) for playlists, Instagram photo archives, audio formats, per-visitor login sessions, and preferences. Rebuild with `sudo docker compose up --build -d`. The owner-wide cookie configuration now requires `FETCHLY_PRIVATE_MODE=1` for private instances; normal shared use uses the per-visitor importer. TikTok includes a public-page fallback that verifies a video source before offering downloads.

# Fetchly social media video downloader

This update keeps the existing Next.js interface and replaces `btch-downloader` with a private Python **yt-dlp + FFmpeg** extraction service. It adds TikTok oEmbed preview fallback, source-resolution choices, and a redesigned media/download panel. Instagram single-video posts and Reels also use Instaloader as a fallback when yt-dlp fails. Supported URL families: YouTube (including Shorts), TikTok, Instagram video/Reels, Facebook video, and X/Twitter video. Availability depends on the post, extractor version, login, region, and platform restrictions. Instagram photos are supported in the separate Instagram photos mode; livestream capture is not implemented. This is a tested video/audio implementation, not a guarantee that every social link works.

## Why the old build downloaded JSON

1. `/api/download` trusted successful HTTP responses even when their Content-Type was JSON/HTML. It forwarded error/metadata bytes as an attachment and guessed an MP4 extension.
2. The download button used an anchor immediately. A JSON error from your own API was therefore saved as a file, and the button reported success without checking the response.
3. The resolver depended on `btch-downloader` third-party endpoints, inferred media types from URL suffixes, and did not handle platform headers, segmented media, or separate video/audio streams.

The first two faults are confirmed by source inspection. Without the original failed links and captured upstream responses, the exact endpoint failure that triggered your downloads cannot be established.

## New behavior

- yt-dlp extracts and downloads media with its platform-specific extractors and request headers. TikTok’s official oEmbed fallback returns preview metadata only, not a downloadable media file. Instaloader supplies Instagram photo galleries and a single-video fallback; it does not cover TikTok, YouTube, Facebook, or X.
- FFmpeg combines source streams, creates validated MP4/MKV output while preserving compatible source streams, and enables fast-start playback. MP3 uses real audio conversion, not an extension rename.
- FFprobe verifies the produced stream. JSON/HTML cannot pass conversion as a valid video.
- Resolve returns opaque server tokens. The browser cannot supply arbitrary CDN URLs to a proxy.
- Download preparation runs as a bounded background job. The UI uses increasing poll intervals, displays actionable errors, and starts the browser download after the prepared file is ready and offers a retry button if the browser blocks the first save.
- The app does not impose a per-platform cooldown. Platform 403/429 responses are shown as errors; TikTok may still return an official preview through oEmbed, but the API does not provide a video file.
- Final delivery streams the prepared file rather than loading the whole file into browser memory.
- Temporary files and tokens expire after 30 minutes. Restarting the service invalidates pending results.
- Two download workers, four outstanding jobs, two concurrent metadata requests, 500 MiB default file cap, and processing time limits bound resource use.
- URLs are checked by hostname, scheme, credentials, and port. Lookalike hosts and private-IP URLs are rejected.
- The backend requires a shared secret and binds to loopback by default.

## Recommended: Docker

Install Docker with Compose, then:

```sh
cp .env.example .env
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Paste the generated secret into `MEDIA_BACKEND_KEY` in `.env`, then:

```sh
docker compose up --build -d
```

Open `http://localhost:3000`. The container includes Node.js, Python, yt-dlp with EJS and browser impersonation support, FFmpeg, and FFprobe. The Docker recipe is included but has not been executed in the development environment.

## Local development

Requirements: Node.js 24+, pnpm, Python 3.10+, FFmpeg and FFprobe available on PATH. FFmpeg must include libx264 and libmp3lame.

```sh
pnpm install --frozen-lockfile
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r backend/requirements.txt
cp .env.example .env.local
```

Set a random `MEDIA_BACKEND_KEY` in `.env.local`. Next.js reads this file; **Python does not read dotenv files**. In terminal 1, explicitly set the same key before running Python:

```sh
export MEDIA_BACKEND_KEY='your-generated-secret'
python3 backend/server.py
```

In terminal 2:

```sh
pnpm dev
```

On Windows PowerShell, activate `.venv\Scripts\Activate.ps1`, use `$env:MEDIA_BACKEND_KEY = 'your-generated-secret'`, and run Python normally. Install FFmpeg/FFprobe and Node on PATH. `MEDIA_BACKEND_URL` defaults to `http://127.0.0.1:8787`.

## Optional TikTok session for private use

Like Social Saver's cookie setting, a private, single-user Fetchly instance can optionally use a Netscape-format TikTok cookie file. Mount it read-only in `compose.yaml` at `/run/tiktok-cookies.txt` and set `TIKTOK_COOKIES_FILE=/run/tiktok-cookies.txt` in `.env`. The backend filters the jar to TikTok domains, copies the relevant entries into a mode-0600 temporary file for each extraction/download, then deletes that copy.

This uses the instance owner's TikTok session for requests. **Do not enable it on a public or multi-user website**: every visitor's download request would use that same account session. The file remains the owner's login credential and must never be committed or shared. Cookies may help with login or challenge access, but they do not guarantee TikTok will accept the server request.

## TikTok API behavior

TikTok’s official oEmbed endpoint is used as a metadata-only fallback when yt-dlp cannot resolve a TikTok link. It can return a title, creator, and thumbnail; it does not provide downloadable video bytes. TikTok’s Display API is scoped to videos belonging to an authorized user and returns metadata/embed links, while the Content Posting API uploads videos to TikTok. None of these official APIs downloads an arbitrary public post.

When the extractor is allowed to access a video, Fetchly lists available source resolutions with the highest resolution first. When TikTok refuses extraction but oEmbed succeeds, Fetchly shows a preview and links the user to TikTok instead of presenting fake download choices. For videos whose creator allows downloads, TikTok’s own Save video action remains the supported route.

## Verification

```sh
pnpm typecheck
pnpm build
python3 -m unittest discover -s backend/tests -v
python3 scripts/e2e-smoke.py
```

The smoke test requires a production build, free ports 8787/3099, and FFmpeg. It uses synthetic extraction fixtures and real media conversion to exercise the Next.js ↔ Python flow. It does **not** prove live platform downloads. See `VALIDATION.md` and the recorded live test JSON files for actual coverage.

## Deployment and maintenance

Use a persistent server/container with local disk and long-running processes. This backend cannot run as a short-lived edge function. A Next.js-only Vercel deployment is insufficient; deploy the media service separately and set its URL/key, with private networking or TLS.

The bundled Compose configuration listens on localhost. Before exposing it publicly, add authentication, per-user rate limits, reverse-proxy HTTPS, and network egress controls that deny private/link-local/metadata networks. Initial URL checks do not cover every redirect followed inside upstream extractors. Allow only the platform/CDN destinations your deployment needs. This implementation is intended for local/private use until those deployment controls are configured.

Video conversion uses CPU and temporary disk. On forced termination, temporary directories may survive until your host cleans its temp directory. Fetchly supports per-visitor cookie imports. Owner-wide TikTok cookies must remain disabled on public/shared deployments.

The tested yt-dlp version is pinned in `backend/requirements.txt`. For an extractor regression, test a current stable/nightly release, update that pin, rerun checks with real affected links, and rebuild the image. A 403 can also mean that the platform refuses the server or its network address. The Instagram fallback may help when one extractor breaks, but it uses the same host/network and may receive the same refusal. TikTok oEmbed is metadata-only and cannot bypass download restrictions. It is restricted to single video posts and Reels; carousels and photo-only posts are not covered by the fallback. Do not automatically promise watermark-free output; it depends on the available source.

## Related open-source projects

- https://github.com/yt-dlp/yt-dlp — chosen extraction engine; platform adapters, format selection, segmented downloads, authentication, FFmpeg integration.
- https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md — supported extractors; listing is not a guarantee of availability.
- https://github.com/VishalKaleria/social-saver — desktop reference powered by yt-dlp and gallery-dl, with download queue/history and configurable settings. Its README describes it as personal/non-commercial and all rights reserved; this project borrows no source or assets.

Your existing UI source remains yours. Third-party packages retain their own licenses; this ZIP uses dependencies and does not copy either repository's source.
