## Problem and resulting behavior

Explain the concrete trigger, what happened before, and what happens now.

## Verification

List the commands or manual steps actually run, browser/viewports if relevant, and pass/fail results. Do not check off tests that were not run.

Suggested project checks: `pnpm typecheck`, `pnpm build`, and `python3 -m unittest discover -s backend/tests -v`. The fixture-based smoke test is `python3 scripts/e2e-smoke.py`; it requires the production build, FFmpeg and free ports 8787/3099. Synthetic tests do not prove that a live platform accepts downloads.

Relevant user journey: Resolve a permitted public video URL, inspect available formats, prepare a download, and verify the saved file is media rather than an HTML/JSON error. Check retry and metadata-only fallback behavior.

## Risks and recovery

Describe persisted-data effects, provider/API changes, and rollback steps if applicable.

## Privacy

Never attach cookie jars, backend keys, visitor sessions or signed media URLs. Use owned or synthetic test media. Redact identifying query parameters in example links.
