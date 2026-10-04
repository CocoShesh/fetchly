'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, ArrowRight, Check, Clipboard, Download, Layers, LoaderCircle, Square, X } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DownloadPreferences } from '@/components/downloader/download-settings'
import { DownloadHistory } from '@/components/downloader/download-history'
import { MultipleLinkRow } from '@/components/downloader/multiple-link-row'
import { useDownloadSettings } from '@/lib/use-download-settings'
import { MAX_LINKS, linkError, parseLinks, rowExpired, sourceChoices, type LinkRow } from '@/lib/multiple-links'
import { fileName } from '@/lib/download-settings'
import { prepareDownload, saveDownload } from '@/lib/download-client'
import type { ResolvedMedia } from '@/lib/media-types'

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
export function MultipleDownloader() {
  const { settings, updateSettings } = useDownloadSettings()
  const [text, setText] = useState('')
  const [rows, setRows] = useState<LinkRow[]>([])
  const [cookieSession, setCookieSession] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [output, setOutput] = useState<'zip' | 'files'>('zip')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState('')
  const [archive, setArchive] = useState<{ job: string; signature: string } | null>(null)
  const [now, setNow] = useState(0)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const checkController = useRef<AbortController | null>(null)
  const downloadController = useRef<AbortController | null>(null)
  const operation = useRef(false)
  const mounted = useRef(true)
  const parsed = useMemo(() => parseLinks(text), [text])
  const available = rows.filter(row => row.status === 'ready' && row.token && !rowExpired(row, now))
  const selected = available.filter(row => row.selected)
  const failed = rows.filter(row => row.status === 'error').length
  const changed = rows.length > 0 && (parsed.urls.length !== rows.length || parsed.urls.some((url, index) => rows[index]?.url !== url))
  const signature = JSON.stringify({ tokens: selected.map(row => row.token), audioFormat: settings.audioFormat, videoFormat: settings.videoFormat, videoMode: settings.videoMode, filenamePattern: settings.filenamePattern })
  const cachedArchive = archive?.signature === signature ? archive.job : null

  useEffect(() => {
    mounted.current = true
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 15000)
    const restarted = () => {
      checkController.current?.abort(); downloadController.current?.abort()
      setCookieSession(null); setArchive(null)
      setRows(previous => previous.map(row => ({ url: row.url, status: 'waiting', selected: false })))
      setMessage('The engines restarted. Check your links again.')
    }
    window.addEventListener('fetchly-engines-restarted', restarted)
    return () => { mounted.current = false; clearInterval(timer); checkController.current?.abort(); downloadController.current?.abort(); window.removeEventListener('fetchly-engines-restarted', restarted) }
  }, [])
  function patch(url: string, change: Partial<LinkRow>) {
    if (!mounted.current) return
    setRows(previous => previous.map(row => row.url === url ? { ...row, ...change } : row))
  }
  async function checkLinks(next: LinkRow[], targets: string[]) {
    if (operation.current) return
    operation.current = true
    const controller = new AbortController()
    checkController.current = controller
    setChecking(true); setError(''); setMessage(''); setArchive(null)
    setRows(next); setNow(Date.now())
    try {
      for (const url of targets) {
        if (controller.signal.aborted) break
        const invalid = linkError(url)
        if (invalid) { patch(url, { status: 'error', selected: false, error: invalid }); continue }
        patch(url, { status: 'checking', selected: false, error: undefined, data: undefined, token: undefined, job: undefined, saveState: undefined, saveError: undefined })
        try {
          const response = await fetch('/api/resolve', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, options: { playlist: false, gallery: false, cookieSession } }),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(125000)]),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok || data.error) throw new Error(typeof data.error === 'string' ? data.error : 'The link could not be checked. Retry this item.')
          if (!Array.isArray(data.items)) throw new Error('The server returned an incomplete result. Retry this link.')
          const choices = sourceChoices(data as ResolvedMedia)
          if (data.previewOnly || !choices.length) throw new Error(data.previewMessage || 'No downloadable video or audio was found. Try the single-link page for photo galleries.')
          if (controller.signal.aborted) { patch(url, { status: 'waiting', selected: false }); break }
          patch(url, { status: 'ready', data, token: choices[0].url, selected: false, checkedAt: Date.now(), error: undefined })
        } catch (cause) {
          if (controller.signal.aborted) { patch(url, { status: 'waiting', selected: false }); break }
          patch(url, { status: 'error', selected: false, error: cause instanceof Error && cause.name === 'TimeoutError' ? 'Checking timed out. Retry this link.' : cause instanceof Error ? cause.message : 'Could not reach Fetchly. Retry this link.' })
        }
      }
      if (mounted.current) setMessage(controller.signal.aborted ? 'Checking stopped. You can select the links already checked or check the remaining ones.' : 'Links checked. Select only the items you want to save.')
    } finally { operation.current = false; if (mounted.current) setChecking(false) }
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!parsed.urls.length || operation.current) return
    if (parsed.urls.length > MAX_LINKS) { setError(`Check up to ${MAX_LINKS} unique links at a time. Remove the extra lines to continue.`); return }
    const previous = new Map(rows.map(row => [row.url, row]))
    const next = parsed.urls.map(url => previous.get(url) || { url, status: 'waiting' as const, selected: false })
    const targets = next.filter(row => row.status !== 'ready' || rowExpired(row, Date.now())).map(row => row.url)
    if (!targets.length) { setRows(next); setError(''); setMessage('These links are already checked. Choose your selection below.'); return }
    void checkLinks(next, targets)
  }
  async function paste() {
    try { const value = await navigator.clipboard.readText(); if (value) { setText(value.slice(0, 42000)); setError(''); setMessage('') } }
    catch { textarea.current?.focus(); setMessage('Paste your links into the box, one URL per line.') }
  }
  function changeSettings(next: typeof settings) {
    updateSettings(next)
    if (next.audioFormat !== settings.audioFormat || next.videoFormat !== settings.videoFormat || next.videoMode !== settings.videoMode || next.filenamePattern !== settings.filenamePattern) {
      setArchive(null)
      setRows(previous => previous.map(row => ({ ...row, job: undefined, saveState: undefined, saveError: undefined })))
    }
  }
  async function download() {
    if (operation.current || !selected.length || changed) return
    operation.current = true
    const controller = new AbortController()
    downloadController.current = controller
    setDownloading(true); setError(''); setProgress('Preparing your selection…')
    try {
      if (selected.length > 1 && output === 'zip') {
        const job = cachedArchive || await prepareDownload({ tokens: selected.map(row => row.token!), options: settings, context: { title: 'fetchly-selection' } }, (done, total) => setProgress(`${done} of ${total} items prepared`), controller.signal)
        if (controller.signal.aborted) return
        setArchive({ job, signature })
        const saved = await saveDownload(job, 'fetchly-selection', controller.signal)
        if (controller.signal.aborted) return
        setProgress(saved ? 'Archive prepared and sent to your save location. Check Download history for any failed items.' : 'Archive prepared, but saving failed. Use Download history to retry saving.')
      } else {
        let failures = 0
        for (let index = 0; index < selected.length; index++) {
          if (controller.signal.aborted) break
          const row = selected[index]
          const name = fileName(settings.filenamePattern, row.data!.title, index + 1, { author: row.data?.author, platform: row.data?.platform })
          setProgress(`Preparing ${index + 1} of ${selected.length} files…`)
          patch(row.url, { saveState: 'preparing', saveError: undefined })
          try {
            const job = row.job || await prepareDownload({ token: row.token, options: settings, context: { title: name, sourceUrl: row.url } }, undefined, controller.signal)
            if (controller.signal.aborted) break
            patch(row.url, { job, saveState: 'ready' })
            const saved = await saveDownload(job, name, controller.signal)
            if (controller.signal.aborted) break
            if (!saved) throw new Error('The prepared file could not be saved. Retry saving from Download history.')
          } catch (cause) {
            if (controller.signal.aborted) break
            failures++
            patch(row.url, { saveState: 'error', saveError: cause instanceof Error ? cause.message : 'File preparation failed.' })
          }
        }
        if (!controller.signal.aborted) setProgress(failures ? `${selected.length - failures} files sent to your save location; ${failures} need retry. See each item and Download history.` : `${selected.length} ${selected.length === 1 ? 'file' : 'files'} sent to your save location. Check your browser downloads or chosen folder.`)
      }
    } catch (cause) { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'The selection could not be prepared.'); setProgress('') } }
    finally { operation.current = false; if (mounted.current) setDownloading(false) }
  }
  return <div className="mx-auto w-full max-w-3xl text-left">
    <div className="mb-5 flex items-center justify-between gap-3 text-sm">
      <span className="inline-flex items-center gap-2 text-primary"><Layers className="size-4" /> Multiple links</span>
      <Link href="/#top" className={`rounded-lg py-3 text-muted-foreground hover:text-foreground ${focus}`}>Single link <ArrowRight className="ml-1 inline size-3.5" /></Link>
    </div>
    <form onSubmit={submit}>
      <div className="overflow-hidden rounded-2xl border border-border bg-card focus-within:border-primary/70 focus-within:ring-4 focus-within:ring-primary/10">
        <label htmlFor="multiple-urls" className="block px-5 pt-5 text-sm font-medium text-foreground">Paste your video or audio links</label>
        <textarea ref={textarea} id="multiple-urls" value={text} onChange={event => { setText(event.target.value); setError(''); setMessage('') }} disabled={checking || downloading} rows={5} maxLength={42000} spellCheck={false} autoComplete="off" placeholder={'One URL per line\nhttps://www.youtube.com/watch?v=…\nhttps://www.tiktok.com/@creator/video/…'} aria-describedby="multiple-links-help" className="block min-h-40 w-full resize-y border-0 bg-transparent px-5 py-4 text-base leading-7 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-70" />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
          <p id="multiple-links-help" className="text-xs text-muted-foreground">{parsed.urls.length} / {MAX_LINKS} unique links{parsed.duplicates ? ` · ${parsed.duplicates} duplicates ignored` : ''}</p>
          <div className="flex gap-1"><button type="button" onClick={paste} disabled={checking || downloading} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 ${focus}`}><Clipboard className="size-3.5" /> Paste</button><button type="button" onClick={() => { setText(''); setRows([]); setArchive(null); setError(''); setProgress(''); setMessage(''); textarea.current?.focus() }} disabled={checking || downloading || (!text && !rows.length)} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 ${focus}`}><X className="size-3.5" /> Clear</button></div>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-xs leading-5 text-muted-foreground">Highest available quality is the default. Nothing is downloaded until you make a selection.</p>
        {checking ? <Button type="button" onClick={() => checkController.current?.abort()} className="min-h-12 rounded-xl bg-secondary text-foreground"><Square className="size-3.5" /> Stop checking</Button> : <Button type="submit" disabled={downloading || !parsed.urls.length || parsed.urls.length > MAX_LINKS} className="min-h-12 rounded-xl px-5 font-semibold"><ArrowRight className="size-4" /> Check links</Button>}
      </div>
    </form>
    {parsed.urls.length > MAX_LINKS && <p role="alert" className="mt-3 text-sm text-destructive">Remove {parsed.urls.length - MAX_LINKS} links before checking.</p>}
    {changed && <p role="status" className="mt-4 text-sm text-muted-foreground">Your list changed. Check links to update the selection below.</p>}
    {message && <p role="status" className="mt-4 text-sm leading-6 text-muted-foreground">{message}</p>}
    <fieldset disabled={checking || downloading} className="min-w-0"><DownloadPreferences settings={settings} onChange={changeSettings} cookieSession={cookieSession} onCookies={setCookieSession} /></fieldset>
    {rows.length > 0 && <section className="mt-8 rounded-2xl border border-border bg-card" aria-labelledby="selection-title">
      <div className="border-b border-border px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="selection-title" className="font-display text-xl font-semibold text-foreground">Choose what to save</h2><p role="status" className="text-xs text-muted-foreground">{selected.length} selected · {available.length} ready{failed ? ` · ${failed} unavailable` : ''}</p></div>
        <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={checking || downloading || !available.length} onClick={() => setRows(previous => previous.map(row => ({ ...row, selected: row.status === 'ready' && !rowExpired(row, Date.now()) })))} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-primary disabled:opacity-50 ${focus}`}><Check className="size-4" /> Select all ready</button><button type="button" disabled={checking || downloading || !selected.length} onClick={() => setRows(previous => previous.map(row => ({ ...row, selected: false })))} className={`min-h-11 rounded-lg px-2 text-sm text-muted-foreground disabled:opacity-50 ${focus}`}>Clear selection</button></div>
      </div>
      <ol className="px-4 sm:px-6">{rows.map((row, index) => <MultipleLinkRow key={row.url} row={row} index={index} now={now} locked={checking || downloading} onSelect={checked => patch(row.url, { selected: checked })} onChoice={token => patch(row.url, { token, job: undefined, saveState: undefined, saveError: undefined })} onRetry={() => { void checkLinks(rows, [row.url]) }} />)}</ol>
      <div className="border-t border-border px-5 py-5 sm:px-6">
        {selected.length > 1 && <fieldset disabled={checking || downloading} className="mb-4"><legend className="mb-3 text-xs font-medium text-muted-foreground">Save your selection as</legend><div className="flex flex-wrap gap-3">{([{ value: 'zip', label: 'One ZIP archive', Icon: Archive }, { value: 'files', label: 'Separate files', Icon: Download }] as const).map(option => <label key={option.value} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${output === option.value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}><input type="radio" name="batch-output" value={option.value} checked={output === option.value} onChange={() => setOutput(option.value)} className={`accent-primary ${focus}`} /><option.Icon className="size-4" />{option.label}</label>)}</div>{output === 'files' && <p className="mt-3 text-xs leading-5 text-muted-foreground">Files are prepared in order. Your browser may ask you to allow multiple downloads. Use Choose a folder in preferences where supported.</p>}</fieldset>}
        <Button type="button" onClick={download} disabled={checking || downloading || !selected.length || changed} className="min-h-12 w-full rounded-xl font-semibold">{downloading ? <LoaderCircle className="size-4 animate-spin" /> : selected.length > 1 && output === 'zip' ? <Archive className="size-4" /> : <Download className="size-4" />}{downloading ? 'Preparing selection…' : cachedArchive && selected.length > 1 && output === 'zip' ? 'Save prepared ZIP' : !selected.length ? 'Select items to download' : selected.length === 1 ? 'Download selected file' : output === 'zip' ? `Download ${selected.length} selected as ZIP` : `Download ${selected.length} separate files`}</Button>
        {progress && <p role="status" className="mt-3 text-sm leading-6 text-muted-foreground">{progress}</p>}
      </div>
    </section>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-card p-4 text-sm leading-6 text-destructive">{error}</p>}
    <fieldset disabled={checking || downloading} className="min-w-0"><DownloadHistory cookieSession={cookieSession} onRecheck={url => { setRows(previous => previous.map(row => row.url === url ? { url, status: 'waiting', selected: false } : row)); setArchive(null); setText(previous => parseLinks(previous).urls.includes(url) ? previous : `${previous.trim()}${previous.trim() ? '\n' : ''}${url}`); textarea.current?.focus(); setMessage('Check links to refresh this item before selecting it.') }} /></fieldset>
  </div>
}
