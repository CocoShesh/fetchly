import type { DownloadSettings } from '@/lib/download-settings'
import { currentSaveDirectory, uniqueLocalFile, withFolderWrite } from '@/lib/save-location'
import { toast } from 'sonner'
import { readHistory, writeHistory } from '@/lib/download-history'
interface PreparePayload { token?: string; tokens?: string[]; job?: string; cookieSession?: string | null; options: DownloadSettings & { itemOverrides?: Record<string, Partial<DownloadSettings>> }; context?: { title: string; sourceUrl?: string }; historyId?: string }
function boundedSignal(signal?: AbortSignal) {
  return signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : signal || AbortSignal.timeout(30000)
}
export async function prepareDownload(payload: PreparePayload, progress?: (completed: number, total: number) => void, signal?: AbortSignal) {
  const historyId = payload.historyId || `${Date.now()}-${Math.random().toString(36).slice(2)}`
  writeHistory(historyId, { title: payload.context?.title || 'Download', sourceUrl: payload.context?.sourceUrl, options: payload.options, status: 'preparing', error: undefined, job: payload.job })
  async function body(response: Response) {
    const result = await response.json().catch(() => ({}))
    if (!response.ok || result.error) throw new Error(result.error || 'Download preparation failed.')
    return result
  }
  try {
    const prepared = await body(await fetch('/api/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: payload.token, tokens: payload.tokens, job: payload.job, session: payload.cookieSession, options: payload.options }), signal: boundedSignal(signal) }))
    if (typeof prepared.job !== 'string') throw new Error('The server did not return a download job.')
    writeHistory(historyId, { job: prepared.job })
    const deadline = Date.now() + 16 * 60 * 1000
    while (Date.now() < deadline) {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException('Polling paused', 'AbortError')); return }
        const abort = () => { clearTimeout(timer); reject(new DOMException('Polling paused', 'AbortError')) }
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, 2500)
        signal?.addEventListener('abort', abort, { once: true })
      })
      const result = await body(await fetch(`/api/download?job=${encodeURIComponent(prepared.job)}&status=1`, { signal: boundedSignal(signal) }))
      if (result.status === 'error') throw new Error(result.error || 'Preparation failed.')
      progress?.(result.completed || 0, result.total || 1)
      writeHistory(historyId, { completed: result.completed, total: result.total, expires: result.expires, failedCount: result.failedCount, status: result.status === 'ready' ? 'ready' : 'preparing' })
      if (result.status === 'ready') return prepared.job as string
      if (result.status !== 'processing') throw new Error('Unknown download status.')
    }
    throw new Error('Preparation timed out. Resume this job from Download history.')
  } catch (cause) {
    if (!signal?.aborted) writeHistory(historyId, { status: 'error', error: cause instanceof Error ? cause.message : 'Download failed.' })
    throw cause
  }
}
export async function saveDownload(job: string, filename: string, signal?: AbortSignal) {
  try {
    const response = await fetch(`/api/download?job=${encodeURIComponent(job)}&status=1`, { signal: boundedSignal(signal) })
    const status = await response.json()
    if (!response.ok || status.status !== 'ready') throw new Error(status.error || 'The server file is unavailable. Check the original link again.')
    if (signal?.aborted) return false
    const folder = currentSaveDirectory()
    if (folder) {
      const ext = ['mp4', 'mkv', 'mp3', 'm4a', 'flac', 'opus', 'jpg', 'png', 'webp', 'gif', 'zip'].includes(status.ext) ? status.ext : null
      if (!ext) throw new Error('Unknown file extension from the media server.')
      return await withFolderWrite(async () => {
      if (signal?.aborted) return false
      const response = await fetch(`/api/download?${new URLSearchParams({ job, filename })}`, { signal })
      if (!response.ok || !response.body) throw new Error('The file could not be transferred. Retry from history.')
      const local = await uniqueLocalFile(folder, filename, ext)
      try {
        await response.body.pipeTo(await local.file.createWritable(), { signal })
      } catch (cause) {
        try { await folder.removeEntry(local.name) } catch { /* Permission may have been revoked. */ }
        throw cause
      }
      if (signal?.aborted) return false
      for (const row of readHistory().filter(record => record.job === job)) writeHistory(row.id, { saveStatus: 'saved-to-folder', savedFolder: folder.name, savedAt: Date.now() })
      toast.success(`Saved ${local.name} to ${folder.name}`)
      return true
      })
    }
    if (signal?.aborted) return false
    const link = document.createElement('a')
    link.href = `/api/download?${new URLSearchParams({ job, filename })}`
    link.download = ''; document.body.appendChild(link); link.click(); link.remove()
    for (const row of readHistory().filter(record => record.job === job)) writeHistory(row.id, { saveStatus: 'handed-to-browser' })
    return true
  } catch (cause) {
    if (signal?.aborted) return false
    const error = cause instanceof Error ? cause.message : 'The file could not be saved.'
    for (const row of readHistory().filter(record => record.job === job)) writeHistory(row.id, { status: 'error', error })
    toast.error(error)
    return false
  }
}
