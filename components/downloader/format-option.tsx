'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Download, LoaderCircle, Music2, Video, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { prepareDownload, saveDownload } from '@/lib/download-client'
import { DEFAULT_SETTINGS, type DownloadSettings } from '@/lib/download-settings'
import type { MediaItem } from '@/lib/media-types'

const KIND_ICON = { video: Video, audio: Music2, image: ImageIcon } as const
type DownloadState = 'idle' | 'preparing' | 'ready'

async function responseBody(response: Response) {
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.error) {
    throw new Error(typeof body.error === 'string' ? body.error : 'The request failed. Please try again.')
  }
  return body
}

export function FormatOption({
  item,
  titleForFile,
  featured = false,
  settings = DEFAULT_SETTINGS,
  sourceUrl,
}: {
  item: MediaItem
  titleForFile: string
  featured?: boolean
  settings?: DownloadSettings
  sourceUrl?: string
}) {
  const [state, setState] = useState<DownloadState>('idle')
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const Icon = KIND_ICON[item.kind]

  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => { abortRef.current?.abort(); setState('idle'); setJobId(null); setError(null) }, [settings.audioFormat, settings.videoFormat, settings.videoMode])
  const shownExt = item.kind === 'audio' ? settings.audioFormat : item.kind === 'video' ? settings.videoFormat : item.ext
  async function handleDownload() {
    setError(null)
    if (state === 'ready' && jobId) { if (!await saveDownload(jobId, titleForFile)) { setState('idle'); setError('File unavailable. Check Download history or the original link.') } return }
    setState('preparing')
    const controller = new AbortController(); abortRef.current = controller
    try {
      const job = await prepareDownload({ token: item.url, options: settings, context: { title: titleForFile, sourceUrl: item.sourceUrl || sourceUrl } }, undefined, controller.signal)
      setJobId(job); setState('ready'); if (!await saveDownload(job, titleForFile)) setError('The file is prepared but could not be saved. Retry from Download history.')
    } catch (cause) {
      if (controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : 'Preparation failed.'); setState('idle')
    }
  }

  return (
    <div className={`rounded-2xl border p-4 transition-colors sm:p-5 ${featured ? 'border-primary/45 bg-primary/[0.075] shadow-[0_12px_30px_-24px_color-mix(in_oklch,var(--primary)_75%,transparent)]' : 'border-border bg-card hover:border-white/20'}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl ${featured ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}>
            <Icon className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold text-foreground">{item.label || (item.kind === 'video' ? 'Video with audio' : item.kind === 'audio' ? 'Audio only' : 'Media')}</p>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{shownExt}{item.kind === 'video' && (settings.videoMode === 'muted' || item.streamMode === 'video-only') ? ' · muted' : ''}</span>
              {item.badge && <Badge className="h-5 rounded-full bg-primary/15 px-2 text-[10px] font-semibold text-primary hover:bg-primary/15">{item.badge}</Badge>}
            </div>
            <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{item.quality || (featured ? 'Highest available source quality' : 'Audio extracted to MP3')}</p>
            {error && (
              <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-rose-300">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}
            {state === 'preparing' && <p role="status" className="mt-2 text-xs text-primary">Preparing your selected source…</p>}
            {state === 'ready' && <p role="status" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-300"><Check className="size-3.5" /> Ready. Your download should start now. If it doesn’t, click Download file.</p>}
          </div>
        </div>

        <Button
          size="sm"
          onClick={handleDownload}
          disabled={state === 'preparing'}
          data-quick-download={featured ? 'true' : undefined}
          className={`h-10 w-full shrink-0 rounded-xl px-4 text-sm font-semibold sm:w-auto ${featured ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-white/[0.08] text-foreground hover:bg-white/[0.13]'}`}
        >
          {state === 'preparing' ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : state === 'ready' ? <Check data-icon="inline-start" /> : <Download data-icon="inline-start" />}
          {state === 'preparing' ? 'Preparing…' : state === 'ready' ? 'Download file' : 'Prepare file'}
        </Button>
      </div>
    </div>
  )
}
