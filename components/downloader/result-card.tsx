'use client'

import Image from 'next/image'
import { useState } from 'react'
import { ArrowUpRight, BadgeCheck, Clock3, Download, Eye, FileQuestion, Music2, Play, ShieldCheck, Video, ImageIcon } from 'lucide-react'
import { getPlatform } from '@/lib/platforms'
import { PlatformIcon } from '@/components/downloader/platform-icon'
import { FormatOption } from '@/components/downloader/format-option'
import { CollectionPicker } from '@/components/downloader/collection-picker'
import { fileName, type DownloadSettings } from '@/lib/download-settings'
import type { ResolvedMedia } from '@/lib/media-types'

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return null
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function formatViews(count?: number) {
  if (!count || !Number.isFinite(count)) return null
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(count)
}

export function ResultCard({ data, settings, onMore, loadingMore = false }: { data: ResolvedMedia; settings: DownloadSettings; onMore?: () => void; loadingMore?: boolean }) {
  const [tab, setTab] = useState<'video' | 'audio' | 'image'>(data.items.some(item => item.kind === 'video' && (!item.exact || data.collection)) ? 'video' : (data.gallery || data.items.some(item => item.kind === 'image')) ? 'image' : 'audio')
  const platform = getPlatform(data.platform)
  const fileBase = fileName(settings.filenamePattern, data.title, 1, { author: data.author, platform: data.platform })
  const [exactToken, setExactToken] = useState('')
  const exactItems = data.items.filter(item => item.exact && item.kind === tab)
  const exactItem = exactItems.find(item => item.id === exactToken)
  const videoItems = data.items.filter((item) => item.kind === 'video' && (!item.exact || data.collection))
  const audioItems = data.items.filter((item) => item.kind === 'audio' && (!item.exact || data.collection))
  const imageItems = data.items.filter(item => item.kind === 'image')
  const duration = formatDuration(data.duration)
  const views = formatViews(data.viewCount)
  const quickDownload = () => {
    setTab('video')
    window.setTimeout(() => document.querySelector<HTMLButtonElement>('[data-quick-download="true"]')?.click(), 0)
  }
  const visibleItems = tab === 'video' ? videoItems : tab === 'audio' ? audioItems : imageItems

  return (
    <section aria-labelledby="resolved-title" className="overflow-hidden rounded-[26px] border border-border bg-card text-left shadow-[0_26px_78px_-42px_rgba(0,0,0,0.95)]">
      <div className="grid lg:grid-cols-[minmax(280px,0.82fr)_minmax(0,1.18fr)]">
        <div className="border-b border-border p-5 sm:p-7 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {platform && <PlatformIcon platform={platform} tile={false} className="size-4" />}
            <span>{platform?.name ?? 'Media'}</span>
            <span className="text-muted-foreground/50">/</span>
            <span className="flex items-center gap-1 text-emerald-300"><BadgeCheck className="size-3.5" /> Link checked</span>
          </div>
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-white/[0.035]">
            {data.thumbnail ? (
              <Image src={data.thumbnail} alt="" fill className="object-cover" unoptimized sizes="(max-width: 1024px) 100vw, 420px" />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground"><FileQuestion className="size-8" /></div>
            )}
            <span className="absolute bottom-3 left-3 flex size-9 items-center justify-center rounded-xl border border-border bg-black/70 text-white backdrop-blur-sm"><Play className="size-4 fill-current" /></span>
            {duration && <span className="absolute bottom-3 right-3 rounded-md bg-black/75 px-2 py-1 text-xs font-medium tabular-nums text-white">{duration}</span>}
          </div>
          <h2 id="resolved-title" className="mt-5 line-clamp-3 break-words font-display text-xl font-semibold leading-snug text-foreground sm:text-2xl">{data.title}</h2>
          {data.author && <p className="mt-2 truncate text-sm text-muted-foreground">by {data.author}</p>}
          {(duration || views) && (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {duration && <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" />{duration}</span>}
              {views && <span className="inline-flex items-center gap-1.5"><Eye className="size-3.5" />{views} views</span>}
            </div>
          )}
          {data.description && <p className="mt-4 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{data.description}</p>}
          <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            View original post <ArrowUpRight className="size-4" />
          </a>
        </div>

        <div className="min-w-0 p-5 sm:p-7 lg:flex lg:flex-col lg:justify-center">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold text-foreground sm:text-xl">Download options</h3>
              <p className="mt-1 text-sm text-muted-foreground">Choose a format and quality</p>
            </div>
            {!data.previewOnly && !data.collection && videoItems.length > 0 && (
              <button type="button" onClick={quickDownload} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-4 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Download className="size-4" /> Quick download
              </button>
            )}
          </div>

          {data.previewOnly ? (
            <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
              <div className="flex items-center gap-2 font-semibold text-foreground"><Play className="size-4 text-amber-200" /> Preview available · Download unavailable</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{data.previewMessage || 'TikTok returned preview details, but no official downloadable file.'}</p>
              <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Open in TikTok <ArrowUpRight className="size-4" />
              </a>
            </div>
          ) : (
            <>
              <div role="tablist" aria-label="Download type" className="mt-6 flex flex-wrap rounded-xl bg-white/[0.045] p-1">
                <button type="button" role="tab" aria-selected={tab === 'video'} onClick={() => setTab('video')} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === 'video' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  <Video className="size-4" /> Video + audio <span className="text-xs opacity-65">{videoItems.length}</span>
                </button>
                <button type="button" role="tab" aria-selected={tab === 'audio'} onClick={() => setTab('audio')} disabled={audioItems.length === 0} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45 ${tab === 'audio' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  <Music2 className="size-4" /> Audio only <span className="text-xs opacity-65">{audioItems.length}</span>
                </button>
                {(data.gallery || imageItems.length > 0) && <button type="button" role="tab" aria-selected={tab === 'image'} onClick={() => setTab('image')} className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring ${tab === 'image' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}><ImageIcon className="size-4" /> Photos <span className="text-xs">{imageItems.length}</span></button>}
              </div>
              {!data.collection && tab !== 'image' && exactItems.length > 0 && <details className="mt-4 border-b border-border pb-4">
                <summary className="cursor-pointer py-2 text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring">Exact formats & separate streams</summary>
                <label className="mt-3 block text-xs text-muted-foreground">Source format<select value={exactToken} onChange={e => setExactToken(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground focus-visible:ring-2 focus-visible:ring-ring"><option value="">Choose an exact source format…</option>{exactItems.map(item => <option key={item.id} value={item.id}>{item.quality}{item.streamMode === 'video-only' ? ' · video only' : item.kind === 'audio' ? ' · audio only' : ' · with audio'}</option>)}</select></label>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Source ID selects the actual platform stream. Video-only removes audio; save the audio separately from the Audio tab. Output container is set in preferences.</p>
                {exactItem && <div className="mt-3"><FormatOption item={exactItem} sourceUrl={data.sourceUrl} settings={settings} titleForFile={fileBase} /></div>}
              </details>}
              <div role="tabpanel" className="mt-4 space-y-3">
                {data.collection ? <CollectionPicker key={tab} items={visibleItems} settings={settings} title={fileBase} sourceUrl={data.sourceUrl} /> : visibleItems.map((item, index) => <FormatOption key={item.id} item={item} settings={settings} sourceUrl={data.sourceUrl} titleForFile={fileBase} featured={tab === 'video' && index === 0} />)}
                {data.nextOffset != null && <button type="button" disabled={loadingMore} onClick={onMore} className="min-h-11 w-full rounded-xl border border-border px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{loadingMore ? 'Loading more…' : 'Load next 20 posts'}</button>}
                {visibleItems.length === 0 && <p className="rounded-xl border border-border bg-white/[0.025] p-4 text-sm text-muted-foreground">No {tab} format is available for this post.</p>}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2.5 border-t border-border bg-white/[0.025] px-5 py-4 text-xs leading-relaxed text-muted-foreground sm:px-7">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>{data.previewOnly ? 'This is TikTok’s official preview metadata. Fetchly does not receive a video file from the oEmbed API.' : 'Highest available source resolution is listed first. The platform controls which formats Fetchly can access.'}</p>
      </div>
    </section>
  )
}
