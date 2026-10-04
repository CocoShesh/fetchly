'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowRight, Check, Clipboard, LoaderCircle, Link2, ScanSearch, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { detectPlatform } from '@/lib/platforms'
import { PlatformIcon } from '@/components/downloader/platform-icon'
import { ResultCard } from '@/components/downloader/result-card'
import { DownloadHistory } from '@/components/downloader/download-history'
import { EngineSettings } from '@/components/downloader/engine-settings'
import { DownloadPreferences } from '@/components/downloader/download-settings'
import { useDownloadSettings } from '@/lib/use-download-settings'
import type { ResolvedMedia, ResolveErrorBody } from '@/lib/media-types'

type FlowStatus = 'idle' | 'loading' | 'error' | 'success'

const STEPS = [
  { title: 'Paste link', Icon: Link2 },
  { title: 'Review quality', Icon: ScanSearch },
  { title: 'Save your file', Icon: Check },
]

export function HeroDownloader() {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<'video' | 'playlist' | 'gallery'>('video')
  const { settings, updateSettings } = useDownloadSettings()
  const [cookieSession, setCookieSession] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [status, setStatus] = useState<FlowStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ResolvedMedia | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const detected = useMemo(() => detectPlatform(url), [url])
  const activeStep = status === 'loading' ? 1 : status === 'success' ? 2 : 0

  useEffect(() => {
    const restarted = () => { setResult(null); setCookieSession(null); setStatus('idle') }
    window.addEventListener('fetchly-engines-restarted', restarted)
    return () => window.removeEventListener('fetchly-engines-restarted', restarted)
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const candidate = url.trim()
    if (!candidate || status === 'loading') return

    setStatus('loading')
    setError(null)
    setResult(null)
    try {
      const response = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: candidate, options: { playlist: mode === 'playlist', gallery: mode === 'gallery', cookieSession } }),
        signal: AbortSignal.timeout(125000),
      })
      const body = (await response.json().catch(() => ({}))) as ResolvedMedia | ResolveErrorBody | null
      if (!response.ok || !body || typeof body !== 'object' || 'error' in body) {
        setError(body && typeof body === 'object' && 'error' in body ? body.error : 'The link could not be checked. Please try again.')
        setStatus('error')
        return
      }
      setResult(body)
      setStatus('success')
    } catch (cause) {
      setError(cause instanceof Error && cause.name === 'TimeoutError'
        ? 'The platform took too long to respond. Wait a moment, then try again.'
        : 'Could not reach Fetchly. Check your connection and try again.')
      setStatus('error')
    }
  }

  async function loadMore() {
    if (!result || result.nextOffset == null || loadingMore) return
    setLoadingMore(true); setError(null)
    try {
      const response = await fetch('/api/resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: result.sourceUrl, options: { playlist: mode === 'playlist', gallery: mode === 'gallery', cookieSession, galleryEngine: result.galleryEngine, offset: result.nextOffset } }), signal: AbortSignal.timeout(125000) })
      const body = await response.json()
      if (!response.ok || body.error) throw new Error(body.error || 'Could not load more items.')
      setResult(previous => previous ? { ...previous, items: [...previous.items, ...body.items], nextOffset: body.nextOffset } : previous)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load more items.') }
    finally { setLoadingMore(false) }
  }

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setUrl(text.trim())
        setError(null)
        setResult(null)
        setStatus('idle')
      }
    } catch {
      inputRef.current?.focus()
    }
  }

  function handleChange(value: string) {
    setUrl(value)
    setError(null)
    setResult(null)
    if (status !== 'loading') setStatus('idle')
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div aria-label="Media mode" className="mb-4 flex flex-wrap gap-2">
        {([{ id: 'video', label: 'Video & audio' }, { id: 'playlist', label: 'Playlist' }, { id: 'gallery', label: 'Photo galleries' }] as const).map(option => <button key={option.id} type="button" aria-pressed={mode === option.id} disabled={status === 'loading' || loadingMore} onClick={() => { setMode(option.id); setResult(null); setError(null); setStatus('idle') }} className={`min-h-11 rounded-xl border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === option.id ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{option.label}</button>)}
        <Link href="/multiple" className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Multiple links</Link>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="group flex min-h-[62px] min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-border bg-card px-3 shadow-[0_14px_36px_-24px_rgba(0,0,0,0.9)] transition-[border-color,box-shadow] focus-within:border-primary/70 focus-within:ring-4 focus-within:ring-primary/10 sm:px-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.055] text-muted-foreground ring-1 ring-inset ring-white/[0.07]">
            {detected ? <PlatformIcon platform={detected} tile={false} className="size-4.5" /> : <Link2 className="size-4" />}
          </span>
          <Input
            ref={inputRef}
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            maxLength={2048}
            placeholder={mode === 'gallery' ? 'Paste a photo post, gallery, or profile link…' : mode === 'playlist' ? 'Paste a playlist link…' : 'Paste a video link…'}
            value={url}
            onChange={(event) => handleChange(event.target.value)}
            disabled={status === 'loading'}
            aria-label="Social media video link"
            className="h-11 min-h-11 min-w-0 flex-1 rounded-xl border-0 bg-transparent px-2.5 text-base shadow-none placeholder:text-muted-foreground/90 focus-visible:border-transparent focus-visible:bg-transparent focus-visible:ring-0 disabled:opacity-70 dark:bg-transparent"
          />
          <div className="flex shrink-0 items-center gap-1 border-l border-border pl-2">
            {url && status !== 'loading' && (
              <button
                type="button"
                onClick={() => { setUrl(''); setError(null); setResult(null); setStatus('idle'); inputRef.current?.focus() }}
                aria-label="Clear link"
                title="Clear link"
                className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handlePaste}
              aria-label="Paste link from clipboard"
              title="Paste link"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Clipboard className="size-4" />
            </button>
          </div>
        </div>
        <Button
          type="submit"
          disabled={status === 'loading' || !url.trim()}
          className="h-[60px] shrink-0 rounded-2xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-[0_12px_28px_-14px_color-mix(in_oklch,var(--primary)_75%,transparent)] hover:bg-primary/90 sm:min-w-40"
        >
          {status === 'loading' ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ArrowRight data-icon="inline-end" />}
          {status === 'loading' ? 'Checking…' : 'Check link'}
        </Button>
      </form>

      <div className="mt-3 flex min-h-6 flex-col items-start gap-1 px-1 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
          {detected ? (
            <><PlatformIcon platform={detected} tile={false} className="size-4" /><span className="truncate">{detected.name} link detected</span></>
          ) : (
            <span>Video, playlists & photos · 8 supported platforms</span>
          )}
        </p>
        <span className="shrink-0 text-muted-foreground/70">{cookieSession ? 'Your login session · availability varies' : 'Public links · availability varies'}</span>
      </div>

      <DownloadPreferences settings={settings} onChange={updateSettings} cookieSession={cookieSession} onCookies={setCookieSession} />

      <DownloadHistory cookieSession={cookieSession} onRecheck={value => { setUrl(value); setResult(null); setError(null); setStatus('idle'); inputRef.current?.focus() }} />
      <EngineSettings />

      <ol aria-label="Download steps" className="mx-auto mt-8 grid max-w-xl grid-cols-3">
        {STEPS.map(({ title, Icon }, index) => {
          const complete = index < activeStep
          const active = index === activeStep
          return (
            <li key={title} aria-current={active ? 'step' : undefined} className="relative flex flex-col items-center gap-2 text-center">
              {index < STEPS.length - 1 && <span aria-hidden className={`absolute left-1/2 top-4 h-px w-full ${complete ? 'bg-primary' : 'bg-white/10'}`} />}
              <span className={`relative z-10 flex size-8 items-center justify-center rounded-full border transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : complete ? 'border-primary/70 bg-primary/15 text-primary' : 'border-border bg-card text-muted-foreground'}`}>
                <Icon className="size-3.5" />
              </span>
              <span className={`text-xs ${active ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{title}</span>
            </li>
          )
        })}
      </ol>

      <div className="mt-8" aria-live="polite">
        {status === 'loading' && (
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-center gap-3 text-sm font-medium text-foreground">
              <LoaderCircle className="size-4 animate-spin text-primary" />
              Checking the post and its highest available formats
            </div>
            <div className="mt-5 flex gap-4">
              <Skeleton className="size-20 shrink-0 rounded-xl sm:size-24" />
              <div className="flex flex-1 flex-col justify-center gap-3">
                <Skeleton className="h-3 w-24 rounded-full" />
                <Skeleton className="h-4 w-4/5 rounded-full" />
                <Skeleton className="h-3 w-1/3 rounded-full" />
              </div>
            </div>
          </div>
        )}

        {status === 'error' && error && (
          <Alert variant="destructive" className="grid-cols-[auto_1fr] gap-x-3 rounded-2xl border-destructive/30 bg-[#1c1219] p-4 sm:p-5">
            <AlertCircle className="mt-0.5 size-5" />
            <div>
              <AlertTitle className="text-sm font-semibold text-foreground">This link could not be prepared</AlertTitle>
              <AlertDescription className="mt-1 text-sm leading-relaxed">{error}</AlertDescription>
              <button type="button" onClick={() => inputRef.current?.focus()} className="mt-3 text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80">
                Edit the link
              </button>
            </div>
          </Alert>
        )}

        {status === 'success' && result && <ResultCard key={result.sourceUrl + mode} data={result} settings={settings} onMore={loadMore} loadingMore={loadingMore} />}
        {status === 'success' && error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  )
}
