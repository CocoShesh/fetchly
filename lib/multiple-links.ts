import { detectPlatform } from '@/lib/platforms'
import type { MediaItem, ResolvedMedia } from '@/lib/media-types'

export const MAX_LINKS = 20
export interface LinkRow {
  url: string
  status: 'waiting' | 'checking' | 'ready' | 'error'
  data?: ResolvedMedia
  error?: string
  selected: boolean
  token?: string
  checkedAt?: number
  job?: string
  saveState?: 'preparing' | 'ready' | 'error'
  saveError?: string
}
export function parseLinks(text: string) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const unique = [...new Set(lines.map(line => {
    try {
      const url = new URL(/^https?:\/\//i.test(line) ? line : `https://${line}`)
      url.hash = ''
      return url.href
    } catch { return line }
  }))]
  return { urls: unique, duplicates: lines.length - unique.length }
}
export function linkError(url: string) {
  if (url.length > 2048) return 'This link is too long. Use the original post URL.'
  const platform = detectPlatform(url)
  if (!platform) return 'Use a supported HTTPS video or audio link, with one URL per line.'
  if (['pinterest', 'reddit', 'flickr'].includes(platform.id)) return 'This platform currently supports photos. Open Photo galleries on the single-link page.'
  return null
}
export function sourceChoices(data?: ResolvedMedia): MediaItem[] {
  return data?.items.filter(item => !item.exact && (item.kind === 'video' || item.kind === 'audio')) || []
}
export function rowExpired(row: LinkRow, now: number) {
  return Boolean(row.checkedAt && now - row.checkedAt >= 30 * 60 * 1000)
}
