# Fetchly media tools

## Video and audio

- Video mode preserves all exposed source-resolution choices, highest first. Shorts and recorded VODs use the existing supported-platform extractors. 8K is listed only when actually exposed by the source. Live recording and DRM decryption are not implemented.
- MP4 and MKV containers; video is copied where compatible. MP4 can require transcoding incompatible codecs. MKV preserves source codecs where supported.
- MP3, M4A/AAC, FLAC, and Opus conversion through FFmpeg. Lossless conversion does not recover detail missing from a lossy source.

## Collections

- Playlist mode resolves 20 entries per page; Load next 20 posts appends more entries. Highest available video choice is preselected per entry; choose audio tab to create an audio archive.
- Select/deselect individual entries and their source quality. Download selections as a ZIP. A ZIP accepts up to 100 items and the existing MAX_DOWNLOAD_BYTES cap, default 500 MiB.
- Instagram photos mode supports post carousels and paginated profiles through Instaloader. Videos inside a carousel are skipped in photo mode; use Video mode for video posts.
- gallery-dl adds gallery extraction for X, TikTok photo posts, Pinterest, Reddit, and Flickr, plus an Instagram fallback. JPEG, PNG, WebP, and GIF signatures are checked before delivery. Pagination remains bound to the selected engine; site access can still require cookies or fail upstream.
- Partial failures appear in download-errors.json inside the archive. If every item fails, the job returns an error.

## Login sessions

Import a Netscape-format cookies.txt using Download preferences. Only cookie records for supported platforms are accepted. Every upload gets an opaque, unguessable session token, held only in React memory. A resolver attaches that session only to the corresponding user's media tokens. Cookies remain in backend memory for 30 minutes; extraction uses private mode-0600 temporary copies, removed afterward. There is no database or browser cookie-file storage. Remove session revokes future extraction; files already prepared still expire normally.

Instagram gallery authentication uses the same session jar. Platform restrictions can still prevent access. Use HTTPS for public deployment. The existing owner-wide TIKTOK_COOKIES_FILE setting now requires FETCHLY_PRIVATE_MODE=1, and must not be enabled on shared deployments. Public instances should use per-visitor imports only.

## Preferences

Audio format, video container, filename pattern ({title}, {index}), theme, and concurrent fragment count (1/2/4) persist in browser localStorage. On supported desktop browsers under HTTPS or localhost, Choose folder streams files into a browser-approved directory and records confirmed completion. The directory permission handle stays in memory and must be chosen again after a page reload. Phones and unsupported browsers use the normal browser download location; the app cannot confirm saving to disk through that flow. Folder writes are serialized and existing filenames receive a numbered suffix. ZIP members use a unique numeric prefix to prevent duplicate filenames.

## Server resource limits

Two workers, four outstanding jobs, two concurrent resolutions, 15-minute processing deadlines, temporary-file expiry, and maximum file/archive bytes remain in place. These are infrastructure limits, not a per-link retry cooldown. Users can save a prepared file again while it remains available.

This remains a local/private deployment by default. Before public exposure, configure HTTPS, authentication and per-user quotas, disk monitoring, and network egress restrictions; extractor-controlled redirects are not fully constrained by the initial URL allowlist. Long profiles may be expensive because Instaloader iterates preceding posts to reach the requested offset.

## Compilation

The production Next.js build and TypeScript check are used to check integration. Live downloads for new playlist/gallery/login flows require platform-specific manual confirmation; compiler success does not prove access to every post.


## Precise controls and history

Exact video and audio source-format IDs are exposed under Exact formats & separate streams. Video choices include combined and video-only output; muted output can also be applied to resolution presets. The source format and output container are separate controls. Per-item playlist overrides support video container/audio mode or audio output format. Network retry counts and yt-dlp transfer speed caps are configurable.

Browser-local history keeps up to 100 preparation records with status, timestamp, progress, source link, output preferences, and opaque job IDs. It does not store imported cookies or admin keys. Ready identifies server preparation, not confirmed saving to disk. Save validates job readiness before opening the attachment.

Failed single jobs retain yt-dlp partial files for retry until expiry; resumption depends on the extractor and source allowing it. Batch jobs cache completed files and partial failed sources, so Retry failed items skips completed items and rebuilds a fresh ZIP manifest. Cached batch results add temporary disk overhead (archive plus cached files). Expired jobs require rechecking the original link. Imported cookies can be reattached to a retry from the current in-memory session.

Prepared files support single HTTP byte ranges and HEAD, allowing browser transfer resumption while the job is available. The Next.js fetch timeout now covers response headers rather than aborting a slow complete file transfer after 30 seconds.

## Admin engine updates

The Server engines panel reports installed versions. Set a separate `FETCHLY_ADMIN_KEY` of at least 32 characters in `.env` to enable Update & restart engines, then recreate the container. Use a generated random secret, not the shared backend key. The key is submitted only for an update and is not persisted in browser storage. Use HTTPS for remote administration.

Updates are accepted only when no extraction or job is active. The service installs yt-dlp, gallery-dl, and Instaloader from PyPI into a new isolated package directory, checks imports in a fresh interpreter, switches an activation marker, and restarts the Python process. Failed installation retains existing packages. A process restart clears transient jobs/files/cookie sessions. Save your files before updating.

`FETCHLY_ENGINE_DIR` defaults to `/app/engines`. Compose mounts a named volume at this path so activated packages survive container recreation. Docker creates this directory with the runtime user's ownership. For native Python installations, configure a directory writable by the service account. Older package release directories are retained for operator-managed rollback and consume disk; monitor this volume.

### Coverage of this update

Python syntax, TypeScript compilation, production build, and empty-state/control layout were checked. No live download verification across the newly added gallery providers or real admin package update was performed. Site availability and partial-file resumption must be confirmed with actual source requests; compiler success alone does not establish them.


## Multiple links

The `/multiple` page uses the same Fetchly background, logo, typography, preferences, and history. Paste one video/audio URL per line (up to 20 unique links per checking pass). Duplicate normalized URLs are ignored. Checks run sequentially through the existing resolver so one bad URL does not discard the remaining results.

Nothing is selected automatically. Choose one, a few, or all checked links; pick video quality or audio per URL. Highest available video quality is the first/default choice. One selected item saves as a single file. Multiple selections can save as a ZIP archive or separate files, prepared sequentially. Browsers can require allowing multiple automatic downloads; an approved desktop save folder is another option.

Each failed URL can be checked again. Source choices expire after 30 minutes and must be refreshed. Prepared files reuse their cached jobs while available; failed preparations appear in Download history for retry/resume. A partial ZIP includes the backend's existing failure manifest. Galleries and whole playlists remain on the single-link page. Imported cookie sessions stay in memory on the current page and are not transferred automatically across page navigation.

The existing backend resource limits and platform restrictions still apply. Production compilation checks this integration; mixed-platform live downloads require manual confirmation.
