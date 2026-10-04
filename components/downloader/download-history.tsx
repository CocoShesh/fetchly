'use client'
import { useEffect, useState } from 'react'
import { Clock3, Download, RotateCcw, Trash2, LoaderCircle, ExternalLink } from 'lucide-react'
import { clearHistory, readHistory, writeHistory, type HistoryRecord } from '@/lib/download-history'
import { prepareDownload, saveDownload } from '@/lib/download-client'
import { DEFAULT_SETTINGS } from '@/lib/download-settings'

export function DownloadHistory({ onRecheck, cookieSession }: { onRecheck: (url: string) => void; cookieSession?: string | null }) {
  const [rows, setRows] = useState<HistoryRecord[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const read = () => setRows([...readHistory()])
    read(); window.addEventListener('fetchly-history-change', read); window.addEventListener('storage', read)
    const controller = new AbortController()
    let refreshing = false
    async function refresh() {
      if (refreshing || controller.signal.aborted) return
      refreshing = true
      for (const row of readHistory().filter(record => record.job && record.status === 'preparing')) {
        try {
          const response = await fetch(`/api/download?job=${encodeURIComponent(row.job!)}&status=1`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) })
          const result = await response.json()
          if (response.ok) writeHistory(row.id, { status: result.status === 'ready' ? 'ready' : result.status === 'error' ? 'error' : 'preparing', error: result.error, expires: result.expires, completed: result.completed, total: result.total, failedCount: result.failedCount })
          else if (response.status === 404) writeHistory(row.id, { status: 'error', error: 'Server file expired. Check the original link again.' })
        } catch { /* A network interruption does not mean the server job failed. */ }
      }
      refreshing = false
    }
    void refresh(); const timer = setInterval(() => { void refresh() }, 8000)
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('fetchly-history-change', read); window.removeEventListener('storage', read) }
  }, [])
  async function retry(row: HistoryRecord) {
    if (!row.job) { if (row.sourceUrl) onRecheck(row.sourceUrl); return }
    setBusy(row.id); setError('')
    try {
      const job = await prepareDownload({ job: row.job, cookieSession, options: row.options || DEFAULT_SETTINGS, context: { title: row.title, sourceUrl: row.sourceUrl }, historyId: row.id })
      saveDownload(job, row.title)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Retry failed.') }
    finally { setBusy(null) }
  }
  return <details className="mt-5 rounded-2xl border border-border bg-card text-left">
    <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring"><Clock3 className="size-4 text-primary" /> Download history <span className="ml-auto text-xs text-muted-foreground">{rows.length} records</span></summary>
    <div className="border-t border-border p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-prose text-xs leading-relaxed text-muted-foreground">History stays in this browser. Ready means the server prepared the file; your browser controls saving. Files expire after 30 minutes. Retry can reuse yt-dlp partial files when available.</p><button type="button" disabled={Boolean(busy)} onClick={clearHistory} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"><Trash2 className="size-4" /> Clear history</button></div>
      {rows.length === 0 && <p className="py-5 text-sm text-muted-foreground">Your prepared files and failed attempts will appear here.</p>}
      <ol className="max-h-[440px] space-y-3 overflow-y-auto">
        {rows.map(row => { const expired = row.expires ? row.expires * 1000 < Date.now() : false; return <li key={row.id} className="border-b border-border pb-4 last:border-0">
          <p className="break-words text-sm font-medium">{row.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()} · {expired ? 'Expired' : row.status === 'ready' ? 'Ready on server' : row.status === 'error' ? 'Needs retry' : 'Preparing'}{row.failedCount ? ` · ${row.failedCount} failed` : ''}{row.total ? ` · ${row.completed || 0}/${row.total}` : ''}</p>
          {row.saveStatus === 'saved-to-folder' && <p className="mt-1 text-xs text-muted-foreground">Saved to {row.savedFolder} · {row.savedAt ? new Date(row.savedAt).toLocaleTimeString() : ''}</p>}
          {row.error && <p className="mt-1 break-words text-xs text-destructive">{row.error}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            {!expired && row.job && row.status === 'ready' && <button type="button" onClick={() => saveDownload(row.job!, row.title)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"><Download className="size-4" /> Save file</button>}
            {!expired && row.job && (row.status !== 'ready' || Boolean(row.failedCount)) && <button type="button" disabled={Boolean(busy)} onClick={() => { void retry(row) }} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs focus-visible:ring-2 focus-visible:ring-ring">{busy === row.id ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}{row.status === 'preparing' ? 'Continue watching' : row.failedCount ? 'Retry failed items' : 'Retry / resume'}</button>}
            {row.sourceUrl && <button type="button" onClick={() => onRecheck(row.sourceUrl!)} className="inline-flex min-h-10 items-center gap-2 px-2 text-xs text-primary"><ExternalLink className="size-4" /> Check original link</button>}
          </div>
        </li> })}
      </ol>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  </details>
}
