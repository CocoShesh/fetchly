# Contributing to fetchly

## Start with the correct application

Use Node.js 24+, pnpm, Python 3.10+, FFmpeg and FFprobe. Run `pnpm install --frozen-lockfile`, create a Python virtual environment, and install `backend/requirements.txt`. Copy `.env.example` to `.env.local`. Set the same generated `MEDIA_BACKEND_KEY` in Next.js and the Python process; Python does not load dotenv automatically. Start `python3 backend/server.py` and `pnpm dev` in separate terminals. See README.md for Docker setup.

## Keep changes reviewable

Describe the observed problem and the behavior after your change. Keep one concern per pull request; avoid unrelated dependency updates and formatting churn. Read existing repository instructions before changing source.

## Verification

`pnpm typecheck`, `pnpm build`, and `python3 -m unittest discover -s backend/tests -v`. The fixture-based smoke test is `python3 scripts/e2e-smoke.py`; it requires the production build, FFmpeg and free ports 8787/3099. Synthetic tests do not prove that a live platform accepts downloads.

For browser changes, check 390 × 844, 768 × 1024 and 1440 × 900 viewports. Look for horizontal overflow, clipped controls, readable text and keyboard focus. Record the actual browser and dimensions; a screenshot alone does not prove the whole journey.

Useful end-to-end check: Resolve a permitted public video URL, inspect available formats, prepare a download, and verify the saved file is media rather than an HTML/JSON error. Check retry and metadata-only fallback behavior.

## Handle sensitive data

Never attach cookie jars, backend keys, visitor sessions or signed media URLs. Use owned or synthetic test media. Redact identifying query parameters in example links.

## Before opening a pull request

- Explain what changed and why.
- List commands actually run and their results; state skipped checks explicitly.
- Include reproducible steps for bug fixes and relevant screenshots for UI changes.
- Describe migration or rollback needs when changing persisted data.
