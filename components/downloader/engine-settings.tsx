'use client'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Wrench } from 'lucide-react'
interface Engines { versions: Record<string, string>; status: string; error?: string; adminEnabled: boolean }
export function EngineSettings() {
  const [engines, setEngines] = useState<Engines | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; void fetch('/api/engines').then(response => response.json()).then(data => { if (alive.current && data.versions) setEngines(data) }).catch(() => {}); return () => { alive.current = false } }, [])
  async function update() {
    setBusy(true); setMessage('Installing updated engines…')
    try {
      const response = await fetch('/api/engines', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fetchly-Admin': key }, body: '{}', signal: AbortSignal.timeout(30000) })
      setKey('')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Update failed.')
      for (let attempt = 0; attempt < 100 && alive.current; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000))
        let state: Engines | null = null
        try {
          state = await fetch('/api/engines', { signal: AbortSignal.timeout(10000) }).then(response => response.json())
        } catch { /* Restart briefly interrupts requests. */ }
        if (!state?.versions) continue
        if (alive.current) setEngines(state)
        if (state.status === 'error') throw new Error(state.error || 'Update failed.')
        if (state.status === 'idle') { setMessage('Engines updated and server restarted. Check your link again.'); window.dispatchEvent(new Event('fetchly-engines-restarted')); return }
      }
      throw new Error('Update is taking longer than expected. Check engine versions again.')
    } catch (cause) { if (alive.current) setMessage(cause instanceof Error ? cause.message : 'Update failed.') }
    finally { if (alive.current) setBusy(false) }
  }
  return <details className="mt-5 rounded-2xl border border-border bg-card text-left">
    <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring"><Wrench className="size-4 text-primary" /> Server engines</summary>
    <div className="border-t border-border p-4 sm:p-5">
      <dl className="grid gap-3 sm:grid-cols-3">{['yt-dlp', 'gallery-dl', 'instaloader'].map(name => <div key={name}><dt className="text-xs text-muted-foreground">{name}</dt><dd className="mt-1 text-sm font-medium">{engines?.versions[name] || 'Unavailable'}</dd></div>)}</dl>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Admins can update engines together. Finish active downloads and save ready files first: updating restarts the media service and clears temporary files and cookie sessions.</p>
      {engines?.adminEnabled ? <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-sm text-muted-foreground">Server admin key<input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground focus-visible:ring-2 focus-visible:ring-ring" /></label><button disabled={busy || key.length < 32} onClick={update} type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"><RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />{busy ? 'Updating…' : 'Update & restart engines'}</button></div> : <p className="mt-3 text-xs text-muted-foreground">The server owner can enable updates with FETCHLY_ADMIN_KEY. Visitors cannot change server packages.</p>}
      {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
    </div>
  </details>
}
