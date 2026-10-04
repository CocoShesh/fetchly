import { NextRequest, NextResponse } from 'next/server'
import { detectPlatform } from '@/lib/platforms'
import { mediaBackend, backendError } from '@/lib/media-backend'
export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'
export async function POST(request: NextRequest) {
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 }) }
  const url = body && typeof body === 'object' && 'url' in body ? body.url : null
  if (typeof url !== 'string' || url.length > 2048) return NextResponse.json({ error: 'Enter a valid link.' }, { status: 400 })
  const platform = detectPlatform(url)
  if (!platform) return NextResponse.json({ error: 'Use a supported HTTPS social media link.' }, { status: 422 })
  try {
    const response = await mediaBackend('/resolve', { method: 'POST', body: JSON.stringify({ url, options: body && typeof body === 'object' && 'options' in body ? body.options : {} }) })
    const result = await response.json()
    return NextResponse.json(response.ok ? { ...result, platform: platform.id } : result, { status: response.status })
  } catch (error) { return NextResponse.json({ error: backendError(error) }, { status: 503 }) }
}
