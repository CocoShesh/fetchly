# Deploy Fetchly

## Backend: Render Docker service

1. Connect your GitHub account to Render and grant access to the private `CocoShesh/fetchly` repository.
2. Create a Blueprint from that repository. `render.yaml` creates a free Docker web service using `backend.Dockerfile`. No personal cookie file is uploaded or mounted.
3. Wait for the service to become live. Open `https://YOUR-SERVICE.onrender.com/healthz`; it should return `{"ok":true}`.
4. Copy the generated `MEDIA_BACKEND_KEY` from the service environment into Vercel as a sensitive server variable. Keep it private.

## Frontend: Vercel

Import the private repository as a Next.js project with its root directory unchanged. Set the following environment variables for production and preview:

- `MEDIA_BACKEND_URL`: the Render HTTPS service URL, without a trailing slash.
- `MEDIA_BACKEND_KEY`: the exact generated backend key. Never use a `NEXT_PUBLIC_` prefix.

Redeploy after setting the variables. The frontend can build without them, but extraction and downloads require the running backend.

## Operating limits

- Render Free sleeps after 15 minutes without incoming traffic; waking can take about a minute. The first request may need retrying.
- Jobs, prepared files, visitor sessions, and staged engine updates are ephemeral. Sleeping, restarting or redeploying clears them. Resolve the link again.
- Keep one backend instance: job state is currently in process memory. Multi-instance scaling needs shared job storage and a task queue.
- Media is streamed through Vercel. Requests have a 300-second function duration; very large or slow transfers may fail. A direct signed download service is a future scaling improvement.
- The existing 500 MiB per-file storage limit protects the small backend disk; it is not a limit on how often someone can download.
- Private content needs that visitor's authorized cookies. Public TikTok extraction can still be refused by TikTok or a provider; server deployment cannot guarantee every post.
- Public access can consume backend CPU and bandwidth. Keep admin engine updates disabled unless a separate strong `FETCHLY_ADMIN_KEY` is configured.

For an always-on deployment, choose a paid backend plan deliberately. This blueprint does not provision a paid service.
