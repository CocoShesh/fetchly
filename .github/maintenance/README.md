# Reviewed maintenance queue

Six independently useful changes for fetchly, prepared from source on 2026-10-10. The five repositories rotate over 2026-10-10–2026-11-08; this repo publishes on the due dates in plan.json.

The workflow runs at 01:17 UTC (09:17 Philippine time), using this repository's GITHUB_TOKEN. No AI key or personal access token is stored. GitHub may delay scheduled runs.

Only one due change is applied per run. Existing destination files or changed source fingerprints cause a safe skip; force pushes are never used. The commit includes a state receipt for idempotency. Outside the window it performs no writes. A missed run can catch up one pending change per subsequent run within the window. The schedule remains visible after the window but becomes a no-op; disable the workflow in Actions to stop those no-op jobs.

Manual runs default to a dry run; select apply to publish a due change. Runs use the default branch. These commits add maintenance tools and contributor/operations guidance; they do not claim browser-tested UI changes. Syntax CI is deliberately labeled and does not prove TypeScript correctness, provider connectivity, camera access or live downloads.

The author is CocoShesh using the account's GitHub noreply email. The bot pushes on the owner's behalf. To pause, disable Scheduled reviewed maintenance in Actions. To recover a failed/conflicted task, review its source and destinations before editing the plan.
