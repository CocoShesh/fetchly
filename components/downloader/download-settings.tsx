'use client'
import { useEffect, useState } from 'react'
import { Settings2, ShieldCheck, Trash2 } from 'lucide-react'
import { canChooseSaveDirectory, chooseSaveDirectory, currentSaveDirectory, forgetSaveDirectory } from '@/lib/save-location'
import type { DownloadSettings } from '@/lib/download-settings'

const control = 'mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
export function DownloadPreferences({ settings, onChange, cookieSession, onCookies }: { settings: DownloadSettings; onChange: (settings: DownloadSettings) => void; cookieSession: string | null; onCookies: (session: string | null) => void }) {
  const [folderAvailable, setFolderAvailable] = useState(false)
  const [folderName, setFolderName] = useState<string | null>(null)
  useEffect(() => { setFolderAvailable(canChooseSaveDirectory()); setFolderName(currentSaveDirectory()?.name || null) }, [])
  async function chooseFolder() {
    try { setFolderName(await chooseSaveDirectory()); setError('') }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('Could not choose a save folder. Use browser downloads or allow folder access.') }
  }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function importFile(file?: File) {
    if (!file) return
    setError(''); setBusy(true)
    try {
      if (file.size > 750000) throw new Error('Choose a cookies.txt file smaller than 750 KB.')
      const response = await fetch('/api/cookies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cookies: await file.text() }), signal: AbortSignal.timeout(30000) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Cookie import failed.')
      onCookies(body.session)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Cookie import failed.') }
    finally { setBusy(false) }
  }
  async function forget() {
    setError(''); setBusy(true)
    try {
      const response = await fetch('/api/cookies', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: cookieSession }) })
      if (!response.ok) throw new Error('Could not remove the cookie session. Try again.')
      onCookies(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Removal failed.') }
    finally { setBusy(false) }
  }
  return <details className="mt-5 rounded-2xl border border-border bg-card text-left">
    <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Settings2 className="size-4 text-primary" /> Download preferences & login</summary>
    <div className="border-t border-border p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-muted-foreground">Video container<select className={control} value={settings.videoFormat} onChange={e => onChange({ ...settings, videoFormat: e.target.value as DownloadSettings['videoFormat'] })}><option value="mp4">MP4 · most compatible</option><option value="mkv">MKV · preserve source codecs</option></select></label>
        <label className="text-sm text-muted-foreground">Audio format<select className={control} value={settings.audioFormat} onChange={e => onChange({ ...settings, audioFormat: e.target.value as DownloadSettings['audioFormat'] })}><option value="mp3">MP3</option><option value="m4a">M4A (AAC)</option><option value="flac">FLAC</option><option value="opus">Opus</option></select></label>
        <label className="text-sm text-muted-foreground">Filename pattern<input className={control} value={settings.filenamePattern} maxLength={120} onChange={e => onChange({ ...settings, filenamePattern: e.target.value })} /><span className="mt-1 block text-xs">Use {'{title}'}, {'{index}'}, {'{author}'}, {'{platform}'}, {'{date}'}. Browser settings control your save folder.</span></label>
        <label className="text-sm text-muted-foreground">Performance<select className={control} value={settings.fragments} onChange={e => onChange({ ...settings, fragments: Number(e.target.value) })}><option value={1}>Gentle · 1 fragment at a time</option><option value={2}>Balanced · 2 fragments</option><option value={4}>Fast · 4 fragments</option></select></label>
        <label className="text-sm text-muted-foreground">Video audio<select className={control} value={settings.videoMode} onChange={e => onChange({ ...settings, videoMode: e.target.value as DownloadSettings['videoMode'] })}><option value="combined">Keep audio</option><option value="muted">Muted video</option></select></label>
        <label className="text-sm text-muted-foreground">Network retries<select className={control} value={settings.networkRetries} onChange={e => onChange({ ...settings, networkRetries: Number(e.target.value) })}>{[0, 1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-sm text-muted-foreground">Download speed cap (KiB/s)<input className={control} type="number" min={0} max={1000000} value={settings.rateLimitKiB} onChange={e => onChange({ ...settings, rateLimitKiB: Math.max(0, Math.min(Number(e.target.value) || 0, 1000000)) })} /><span className="mt-1 block text-xs">0 uses the available connection speed. Applies to yt-dlp streams.</span></label>
        <label className="text-sm text-muted-foreground">Appearance<select className={control} value={settings.theme} onChange={e => onChange({ ...settings, theme: e.target.value as DownloadSettings['theme'] })}><option value="dark">Dark</option><option value="light">Light</option></select></label>
      </div>
      <div className="mt-4 border-t border-border pt-4">
        <h3 className="text-sm font-semibold">Save location</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{folderName ? `Files will be written to ${folderName}. Existing filenames get a copy suffix.` : 'Files use your browser’s download location.'}</p>
        {folderAvailable ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={chooseFolder} className="min-h-10 rounded-lg border border-border px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring">Choose a folder</button>{folderName && <button type="button" onClick={() => { forgetSaveDirectory(); setFolderName(null) }} className="min-h-10 rounded-lg px-3 text-sm text-primary">Use browser downloads</button>}</div> : <p className="mt-2 text-xs text-muted-foreground">Direct folder selection needs a supported desktop browser on HTTPS or localhost. On phones, use your browser’s save options.</p>}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Conversion preserves the available source quality. FLAC does not restore detail already lost in the source.</p>
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-primary" /> Your login session</h3>
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-muted-foreground">Optional: import your own Netscape cookies.txt for posts your account can access. It stays on this server for 30 minutes, is never shared with other visitors, and is not saved in browser storage. Only import on a server you trust.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="min-w-0 text-sm text-muted-foreground">{busy ? 'Importing…' : cookieSession ? 'Session imported · replace file' : 'Import cookies.txt'}<input type="file" accept=".txt" disabled={busy} className="mt-2 block max-w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-foreground" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = '' }} /></label>
          {cookieSession && <button type="button" disabled={busy} onClick={forget} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"><Trash2 className="size-4" /> Remove session</button>}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  </details>
}
