import type { DownloadSettings } from '@/lib/download-settings'
export interface HistoryRecord {
  id: string
  title: string
  sourceUrl?: string
  createdAt: number
  updatedAt: number
  status: 'preparing' | 'ready' | 'error'
  job?: string
  error?: string
  expires?: number
  completed?: number
  total?: number
  failedCount?: number
  saveStatus?: 'handed-to-browser' | 'saved-to-folder'
  savedFolder?: string
  savedAt?: number
  options?: DownloadSettings
}
const KEY = 'fetchly-download-history-v1'
let memory: HistoryRecord[] = []
export function readHistory(): HistoryRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (Array.isArray(parsed)) memory = parsed.filter(row => row && typeof row.id === 'string' && typeof row.title === 'string' && ['preparing', 'ready', 'error'].includes(row.status)).slice(0, 100)
  } catch { /* Memory history stays available when storage is blocked. */ }
  return memory
}
export function writeHistory(id: string, update: Partial<HistoryRecord>) {
  const records = readHistory()
  const previous = records.find(row => row.id === id)
  const row = { title: 'Download', createdAt: Date.now(), status: 'preparing' as const, ...previous, ...update, id, updatedAt: Date.now() }
  memory = [row, ...records.filter(item => item.id !== id)].slice(0, 100)
  try { localStorage.setItem(KEY, JSON.stringify(memory)) } catch { /* Keep in memory. */ }
  window.dispatchEvent(new Event('fetchly-history-change'))
}
export function clearHistory() {
  memory = []
  try { localStorage.removeItem(KEY) } catch { /* Storage may be blocked. */ }
  window.dispatchEvent(new Event('fetchly-history-change'))
}
