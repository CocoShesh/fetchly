import { after, NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { detectPlatform } from '@/lib/platforms'
import { backendError, mediaBackend } from '@/lib/media-backend'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

type TelegramMessage = {
  chat?: { id?: number; type?: string }
  from?: { id?: number }
  text?: string
}

type TelegramUpdate = { message?: TelegramMessage }

type ResolvedMedia = {
  title?: string
  author?: string
  sourceUrl?: string
  items?: Array<{ kind?: string; quality?: string; label?: string }>
  previewOnly?: boolean
  previewMessage?: string
  error?: string
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function allowedUserIds() {
  return new Set((process.env.TELEGRAM_ALLOWED_USERS || '').split(',').map(value => value.trim()).filter(value => /^\d+$/.test(value)))
}

function findMediaUrl(text: string) {
  const candidates = text.match(/(?:https?:\/\/)?[^\s<>]+/gi) || []
  for (const raw of candidates) {
    const candidate = raw.replace(/^[([{"']+|[)\]}.,!?;:'"]+$/g, '')
    if (!detectPlatform(candidate)) continue
    return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`
  }
  return null
}

async function telegramCall(token: string, method: string, payload: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  const result = await response.json().catch(() => null) as { ok?: boolean } | null
  if (!response.ok || !result?.ok) throw new Error(`Telegram ${method} failed (${response.status}).`)
  return result
}

function downloadPageUrl(origin: string, sourceUrl: string) {
  const url = new URL('/', process.env.TELEGRAM_PUBLIC_URL || origin)
  url.searchParams.set('url', sourceUrl)
  return url.toString()
}

async function processUpdate(update: TelegramUpdate, token: string, origin: string) {
  const message = update.message
  const chatId = message?.chat?.id
  if (typeof chatId !== 'number' || message?.chat?.type !== 'private') return

  const status = await telegramCall(token, 'sendMessage', {
    chat_id: chatId,
    text: '🔎 Chine-check ng Fetchly ang link mo…',
  }) as { result?: { message_id?: number } }
  const messageId = status.result?.message_id
  if (!messageId) return

  const edit = async (text: string, replyMarkup?: Record<string, unknown>) => telegramCall(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: text.slice(0, 4000),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    link_preview_options: { is_disabled: true },
  })

  try {
    const text = message?.text?.trim() || ''
    if (/^\/(start|help)(?:@\w+)?(?:\s|$)/i.test(text)) {
      await edit('Ipadala rito ang public YouTube, TikTok, Instagram, Facebook, X, Pinterest, Reddit, o Flickr link. Iche-check ko ito gamit ang Fetchly at ibibigay ko ang button para pumili ng quality at panoorin o i-download sa website.')
      return
    }

    const sourceUrl = findMediaUrl(text)
    if (!sourceUrl) {
      await edit('Wala akong nakitang supported na media link. Magpadala ng public link mula sa mga platform na sinusuportahan ng Fetchly.')
      return
    }

    const response = await mediaBackend('/resolve', {
      method: 'POST',
      body: JSON.stringify({ url: sourceUrl, options: {} }),
    })
    const resolved = await response.json().catch(() => ({})) as ResolvedMedia
    if (!response.ok || resolved.error) {
      await edit(`Hindi ma-check ng Fetchly ang link. ${resolved.error || 'Subukan ulit mamaya.'}`)
      return
    }

    const title = (resolved.title || 'Media link').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 240)
    const author = typeof resolved.author === 'string' ? resolved.author.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 100) : ''
    const qualities = [...new Set((resolved.items || []).filter(item => item.kind === 'video').map(item => item.quality || item.label).filter((value): value is string => Boolean(value)))].slice(0, 5)
    const lines = [`✅ Na-check na ng Fetchly`, ``, title]
    if (author) lines.push(`Creator: ${author}`)
    if (resolved.previewOnly || !qualities.length) {
      lines.push('', resolved.previewMessage || 'Walang nakuha na downloadable video format. Puwede mo pa ring buksan ang original post.')
    } else {
      lines.push('', `Available na video quality: ${qualities.join(', ')}`, '', 'Buksan ang Fetchly para pumili ng quality at panoorin o i-download ang video.')
    }

    const buttons = [
      [{ text: resolved.previewOnly || !qualities.length ? 'Buksan ang original post' : '▶ Panoorin / I-download', url: resolved.previewOnly || !qualities.length ? sourceUrl : downloadPageUrl(origin, sourceUrl) }],
    ]
    if (!resolved.previewOnly && qualities.length) buttons.push([{ text: 'Buksan ang original post', url: sourceUrl }])
    await edit(lines.join('\n'), { inline_keyboard: buttons })
  } catch (error) {
    const messageText = error instanceof Error && error.message.includes('not configured')
      ? 'Hindi pa naka-configure ang media backend ng Fetchly.'
      : error instanceof Error && error.message.startsWith('Telegram ')
        ? 'Hindi naipadala ng Fetchly ang resulta sa Telegram. Subukan ulit.'
        : `Hindi na-process ng Fetchly ang link. ${backendError(error)}`
    await edit(messageText).catch(() => undefined)
  }
}

export async function POST(request: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const users = allowedUserIds()
  if (!token || !secret || users.size === 0) {
    return NextResponse.json({ error: 'Telegram bot is not configured.' }, { status: 503 })
  }

  const receivedSecret = request.headers.get('x-telegram-bot-api-secret-token') || ''
  if (!safeEqual(receivedSecret, secret)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  let update: TelegramUpdate
  try { update = await request.json() as TelegramUpdate } catch { return NextResponse.json({ error: 'Invalid update.' }, { status: 400 }) }
  const senderId = update.message?.from?.id
  if (typeof senderId !== 'number' || !users.has(String(senderId))) return NextResponse.json({ ok: true })

  const origin = request.nextUrl.origin
  after(async () => {
    try { await processUpdate(update, token, origin) }
    catch (error) { console.error('[telegram-webhook] update failed', error instanceof Error ? error.message : 'Unknown error') }
  })
  return NextResponse.json({ ok: true })
}
