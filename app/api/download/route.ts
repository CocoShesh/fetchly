import { NextRequest, NextResponse } from 'next/server'
import { mediaBackend, backendError } from '@/lib/media-backend'
export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'
const TOKEN = /^[A-Za-z0-9_-]{32}$/
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (!body || (typeof body.job === 'string' ? !TOKEN.test(body.job) : Array.isArray(body.tokens) ? body.tokens.length < 1 || body.tokens.length > 100 || body.tokens.some((t: unknown) => typeof t !== 'string' || !TOKEN.test(t)) : typeof body.token !== 'string' || !TOKEN.test(body.token))) return NextResponse.json({ error: 'Invalid media token.' }, { status: 400 })
    const res = await mediaBackend(body.job ? '/retry' : '/prepare', { method: 'POST', body: JSON.stringify({ job: body.job, session: body.session, token: body.token, tokens: body.tokens, options: body.options }) })
    return NextResponse.json(await res.json(), { status: res.status })
  } catch (error) { return NextResponse.json({ error: backendError(error) }, { status: 503 }) }
}
export async function GET(request: NextRequest) {
  const job = request.nextUrl.searchParams.get('job') || ''
  if (!TOKEN.test(job)) return NextResponse.json({ error: 'Invalid download token.' }, { status: 400 })
  try {
    const statusOnly = request.nextUrl.searchParams.get('status') === '1'
    const range = request.headers.get('range')
    const res = await mediaBackend(`/${statusOnly ? 'status' : 'file'}/${job}`, { headers: !statusOnly && range ? { Range: range } : {} })
    if (res.status === 416) return new NextResponse(null, { status: 416, headers: { 'Content-Range': res.headers.get('content-range') || 'bytes */0' } })
    if (statusOnly || !res.ok) return NextResponse.json(await res.json(), { status: res.status })
    const type = res.headers.get('content-type')
    const extensions: Record<string, string> = { 'video/mp4': 'mp4', 'video/x-matroska': 'mkv', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/flac': 'flac', 'audio/ogg': 'opus', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'application/zip': 'zip' }
    if (!res.body || !extensions[type || '']) return NextResponse.json({ error: 'The backend returned invalid media.' }, { status: 502 })
    const ext = extensions[type!]
    const name = (request.nextUrl.searchParams.get('filename') || 'download').replace(/[\x00-\x1f\x7f\\/*?:"<>|]/g, '').slice(0, 100) || 'download'
    const headers = new Headers({ 'Content-Type': type!, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `attachment; filename="download.${ext}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}.${ext}` })
    const size = res.headers.get('content-length')
    if (size) headers.set('Content-Length', size)
    headers.set('Accept-Ranges', 'bytes')
    const contentRange = res.headers.get('content-range')
    if (contentRange) headers.set('Content-Range', contentRange)
    return new NextResponse(res.body, { headers, status: res.status })
  } catch (error) { return NextResponse.json({ error: backendError(error) }, { status: 503 }) }
}
