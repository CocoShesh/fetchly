import { NextRequest, NextResponse } from 'next/server'
import { mediaBackend, backendError } from '@/lib/media-backend'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
async function handle(request: NextRequest, remove: boolean) {
  try {
    if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Use the cookie importer on this website.' }, { status: 403 })
    // Bound the body before JSON parsing; cookies are never logged or returned.
    const reader = request.body?.getReader()
    if (!reader) return NextResponse.json({ error: 'Missing request body.' }, { status: 400 })
    const chunks: Uint8Array[] = []; let size = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > 1000000) { await reader.cancel(); return NextResponse.json({ error: 'Cookie file is too large.' }, { status: 413 }) }
      chunks.push(value)
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const res = await mediaBackend(remove ? '/forget-cookies' : '/cookies', { method: 'POST', body: JSON.stringify(body) })
    return NextResponse.json(await res.json(), { status: res.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return NextResponse.json({ error: backendError(error) }, { status: 503 }) }
}
export const POST = (request: NextRequest) => handle(request, false)
export const DELETE = (request: NextRequest) => handle(request, true)
