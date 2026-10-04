'use client'
import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type DownloadSettings } from '@/lib/download-settings'

export function useDownloadSettings() {
  const [settings, setSettings] = useState<DownloadSettings>(DEFAULT_SETTINGS)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('fetchly-settings') || 'null')
      if (!saved || typeof saved !== 'object') return
      const parsed: DownloadSettings = {
        ...DEFAULT_SETTINGS,
        audioFormat: ['mp3', 'm4a', 'flac', 'opus'].includes(saved.audioFormat) ? saved.audioFormat : 'mp3',
        videoFormat: saved.videoFormat === 'mkv' ? 'mkv' : 'mp4',
        theme: saved.theme === 'light' ? 'light' : 'dark',
        filenamePattern: typeof saved.filenamePattern === 'string' ? saved.filenamePattern.slice(0, 120) : '{title}',
        fragments: [1, 2, 4].includes(saved.fragments) ? saved.fragments : 1,
        videoMode: saved.videoMode === 'muted' ? 'muted' : 'combined',
        networkRetries: Number.isInteger(saved.networkRetries) ? Math.max(0, Math.min(saved.networkRetries, 5)) : 2,
        rateLimitKiB: Number.isInteger(saved.rateLimitKiB) ? Math.max(0, Math.min(saved.rateLimitKiB, 1000000)) : 0,
      }
      setSettings(parsed)
      document.documentElement.dataset.theme = parsed.theme
    } catch { /* Preferences remain usable when storage is unavailable. */ }
  }, [])
  function updateSettings(next: DownloadSettings) {
    setSettings(next)
    document.documentElement.dataset.theme = next.theme
    try { localStorage.setItem('fetchly-settings', JSON.stringify(next)) } catch { /* Keep session preferences. */ }
  }
  return { settings, updateSettings }
}
