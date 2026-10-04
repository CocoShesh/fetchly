'use client'
import { useEffect, useRef, useState } from 'react'
import { Download, LoaderCircle, Archive } from 'lucide-react'
import type { MediaItem } from '@/lib/media-types'
import type { DownloadSettings } from '@/lib/download-settings'
import { prepareDownload, saveDownload } from '@/lib/download-client'

export function CollectionPicker({ items, settings, title, sourceUrl }: { items: MediaItem[]; settings: DownloadSettings; title: string; sourceUrl?: string }) {
  const groups = Array.from(new Set(items.map(item => item.entryId || item.id))).map(id => ({ id, options: items.filter(item => (item.entryId || item.id) === id) }))
  const [selected, setSelected] = useState<Record<string, string>>(() => Object.fromEntries(groups.map(group => [group.id, group.options[0].url])))
  useEffect(() => {
    setSelected(previous => {
      const next = { ...previous }
      for (const item of items) { const id = item.entryId || item.id; if (!(id in next)) next[id] = item.url }
      return next
    })
  }, [items])
  const [overrides, setOverrides] = useState<Record<string, Partial<DownloadSettings>>>({})
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [job, setJob] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => { abortRef.current?.abort(); setJob(null); setBusy(false); setProgress('') }, [settings.audioFormat, settings.videoFormat, settings.filenamePattern, settings.videoMode])
  const tokens = groups.map(group => selected[group.id]).filter(Boolean)
  async function download() {
    setError(''); setBusy(true); setProgress('Preparing selected items…')
    const controller = new AbortController(); abortRef.current = controller
    try {
      const id = await prepareDownload({ tokens, options: { ...settings, itemOverrides: Object.fromEntries(groups.filter(group => selected[group.id]).map(group => [selected[group.id], overrides[group.id] || {}])) }, context: { title: title + '-archive', sourceUrl } }, (done, total) => setProgress(`${done} of ${total} items prepared`), controller.signal)
      setJob(id); saveDownload(id, title + '-archive'); setProgress('Archive ready. Your download should start now.')
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Archive failed.') }
    finally { if (!controller.signal.aborted) setBusy(false) }
  }
  return <div className="mt-4 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{tokens.length} of {groups.length} selected</span>
      <button disabled={busy} type="button" className="min-h-10 rounded-lg px-2 text-primary focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setSelected(tokens.length === groups.length ? {} : Object.fromEntries(groups.map(group => [group.id, group.options[0].url]))); setJob(null) }}>{tokens.length === groups.length ? 'Deselect all' : 'Select all'}</button>
    </div>
    <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
      {groups.map((group, index) => <div key={group.id} className="flex gap-3 rounded-xl border border-border p-3">
        <input aria-label={`Select ${group.options[0].entryTitle || group.options[0].label}`} type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" disabled={busy} checked={Boolean(selected[group.id])} onChange={e => { setSelected(previous => ({ ...previous, [group.id]: e.target.checked ? group.options[0].url : '' })); setJob(null) }} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium">{index + 1}. {group.options[0].entryTitle || group.options[0].label}</p>
          <label className="mt-2 block text-xs text-muted-foreground">Source quality<select disabled={busy} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring" value={selected[group.id] || group.options[0].url} onChange={e => { setSelected(previous => ({ ...previous, [group.id]: e.target.value })); setJob(null) }}>{group.options.map(item => <option key={item.id} value={item.url}>{item.quality || item.label}{item.streamMode === 'video-only' ? ' · video only' : ''}</option>)}</select></label>
          {group.options[0].kind !== 'image' && <details className="mt-2">
            <summary className="cursor-pointer py-2 text-xs text-primary">Custom output for this item</summary>
            {group.options[0].kind === 'audio' ? <label className="block text-xs text-muted-foreground">Audio format<select disabled={busy} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" value={overrides[group.id]?.audioFormat || settings.audioFormat} onChange={e => { setOverrides(previous => ({ ...previous, [group.id]: { ...previous[group.id], audioFormat: e.target.value as DownloadSettings['audioFormat'] } })); setJob(null) }}>{['mp3', 'm4a', 'flac', 'opus'].map(ext => <option key={ext} value={ext}>{ext.toUpperCase()}</option>)}</select></label> : <div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-muted-foreground">Container<select disabled={busy} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" value={overrides[group.id]?.videoFormat || settings.videoFormat} onChange={e => { setOverrides(previous => ({ ...previous, [group.id]: { ...previous[group.id], videoFormat: e.target.value as DownloadSettings['videoFormat'] } })); setJob(null) }}><option value="mp4">MP4</option><option value="mkv">MKV</option></select></label><label className="text-xs text-muted-foreground">Audio<select disabled={busy} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" value={overrides[group.id]?.videoMode || settings.videoMode} onChange={e => { setOverrides(previous => ({ ...previous, [group.id]: { ...previous[group.id], videoMode: e.target.value as DownloadSettings['videoMode'] } })); setJob(null) }}><option value="combined">Keep audio</option><option value="muted">Muted video</option></select></label></div>}
          </details>}
        </div>
      </div>)}
    </div>
    <button type="button" disabled={busy || tokens.length === 0 || tokens.length > 100} onClick={download} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Archive className="size-4" />}{busy ? 'Building archive…' : `Download ${tokens.length} selected as ZIP`}</button>
    {job && <button type="button" onClick={() => saveDownload(job, title + '-archive')} className="inline-flex min-h-10 items-center gap-2 text-sm text-primary"><Download className="size-4" /> Save archive again</button>}
    {progress && <p role="status" className="text-xs text-muted-foreground">{progress}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {tokens.length > 100 && <p role="alert" className="text-sm text-destructive">Select up to 100 items for one archive.</p>}
    <p className="text-xs leading-relaxed text-muted-foreground">Unavailable items are listed in download-errors.json inside the ZIP. Browser permission may be needed to save the archive.</p>
  </div>
}
