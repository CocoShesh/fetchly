import type { Platform } from '@/lib/platforms'

export type MediaKind = 'video' | 'audio' | 'image'

export interface MediaItem {
  id: string
  label: string
  kind: MediaKind
  ext: string
  url: string
  quality?: string
  badge?: string
  entryId?: string
  entryTitle?: string
  sourceUrl?: string
  exact?: boolean
  formatId?: string
  streamMode?: 'combined' | 'video-only'
}

export interface ResolvedMedia {
  platform: Platform
  title: string
  author?: string
  thumbnail?: string
  sourceUrl: string
  items: MediaItem[]
  duration?: number
  viewCount?: number
  description?: string
  galleryEngine?: 'instaloader' | 'gallery-dl'
  gallery?: boolean
  collection?: boolean
  nextOffset?: number | null
  previewOnly?: boolean
  previewMessage?: string
}

export interface ResolveErrorBody {
  error: string
}
