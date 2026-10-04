export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'twitter' | 'pinterest' | 'reddit' | 'flickr'

export interface PlatformInfo {
  id: Platform
  name: string
  icon: string
  /** Tailwind-friendly hex used for glows, chips, and icon tints */
  color: string
  badge?: string
  matchers: RegExp[]
}

export const PLATFORMS: PlatformInfo[] = [
  { id: 'pinterest', name: 'Pinterest', icon: '/icon.svg', color: '#E60023', matchers: [/^(?:[a-z0-9-]+\.)*(?:pinterest\.com|pin\.it)$/i] },
  { id: 'reddit', name: 'Reddit', icon: '/icon.svg', color: '#FF4500', matchers: [/^(?:[a-z0-9-]+\.)*(?:reddit\.com|redd\.it)$/i] },
  { id: 'flickr', name: 'Flickr', icon: '/icon.svg', color: '#0063DC', matchers: [/^(?:[a-z0-9-]+\.)*flickr\.com$/i] },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: '/brands/youtube.svg',
    color: '#FF0033',
    matchers: [/^(?:[a-z0-9-]+\.)*(?:youtube\.com|youtu\.be)$/i],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: '/brands/tiktok.svg',
    color: '#FE2C55',
    matchers: [/^(?:[a-z0-9-]+\.)*tiktok\.com$/i],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: '/brands/instagram.svg',
    color: '#E1306C',
    matchers: [/^(?:[a-z0-9-]+\.)*instagram\.com$/i],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: '/brands/facebook.svg',
    color: '#1877F2',
    matchers: [/^(?:[a-z0-9-]+\.)*(?:facebook\.com|fb\.watch)$/i],
  },
  {
    id: 'twitter',
    name: 'X / Twitter',
    icon: '/brands/x.svg',
    color: '#4DA8FF',
    matchers: [/^(?:[a-z0-9-]+\.)*(?:twitter\.com|x\.com)$/i],
  },
]

export function detectPlatform(rawUrl: string): PlatformInfo | null {
  let url = rawUrl.trim()
  if (!url) return null
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) return null
    url = parsed.hostname.toLowerCase()
  } catch {
    return null
  }

  return PLATFORMS.find((p) => p.matchers.some((m) => m.test(url))) ?? null
}

export function getPlatform(id: string): PlatformInfo | undefined {
  return PLATFORMS.find((p) => p.id === id)
}
