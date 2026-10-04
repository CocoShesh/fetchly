# Validation — 2026-10-04

## Passed

- `pnpm typecheck`: TypeScript passes; the original ignore-build-errors flag was removed.
- `pnpm build`: production Next.js build passes.
- Six backend regression tests pass: supported/hostile URL handling, all five platform metadata fixtures, photo-only rejection, expired-token rejection, real MP4 with video+audio and MP3 generation, JSON-source rejection.
- Local API integration smoke test passes: Next.js resolve → private Python service → prepare job → status polling → binary MP4 with an attachment filename. Arbitrary `src` requests, hostile hosts, and nonexistent download tokens are rejected. This uses synthetic extraction and real FFmpeg conversion.

## Live attempts

The test links came from the installed yt-dlp extractor fixtures. Older fixture posts may also change availability. These results describe this environment and these samples only.

| Platform | Metadata extraction | Actual MP4 download |
| --- | --- | --- |
| YouTube | Failed: network timeout and certificate verification | Not reached |
| TikTok | Failed: connection timeout | Not reached |
| Instagram | Succeeded for one Reel, with API-access warning | Failed: CDN TLS certificate verification |
| Facebook | Failed: network timeout | Not reached |
| X / Twitter | Failed: network timeout | Not reached |

Recorded evidence: `backend/live-test-results.json` and `backend/instagram-download-test.json`. Certificate verification remains enabled. The failures do not establish successful live downloads, or prove that these platforms will fail on a normally connected host.

## Still needs deployment verification

- Build/start the supplied Docker image; Docker was not available for a verified container run here.
- Try a current public video link from each platform on the intended host. Inspect MP4 video and audio with FFprobe and a player.
- Try the user's previously failing links; those links were not supplied.
- Verify login-required cases with cookies from an authorized account.
- Test large-file conversion, mobile browser download delivery, host resource limits, and public-deployment controls before broad rollout.

The implementation fixes the inspected JSON-download paths and passes local media/API regression checks. Full live functionality across all five platforms remains unverified. Photo-only posts and live capture are deliberately reported as unsupported rather than returned as fake MP4 files.
