export async function mediaBackend(path: string, init: RequestInit = {}) {
  const key = process.env.MEDIA_BACKEND_KEY
  if (!key) throw new Error('Downloader backend is not configured. Set MEDIA_BACKEND_KEY.')
  const base = process.env.MEDIA_BACKEND_URL || 'http://127.0.0.1:8787'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), path === '/resolve' ? 120000 : 30000)
  try { return await fetch(`${base}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal: controller.signal,
  }) } finally { clearTimeout(timeout) } // Bound response headers, not the full file transfer.
}
export function backendError(error: unknown) {
  return error instanceof Error && error.message.includes('not configured')
    ? error.message : 'The media backend is unavailable or timed out. Check that the extraction service is running.'
}
