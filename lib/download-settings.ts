export interface DownloadSettings {
  audioFormat: 'mp3' | 'm4a' | 'flac' | 'opus'
  videoFormat: 'mp4' | 'mkv'
  filenamePattern: string
  fragments: number
  videoMode: 'combined' | 'muted'
  networkRetries: number
  rateLimitKiB: number
  theme: 'dark' | 'light'
}
export const DEFAULT_SETTINGS: DownloadSettings = { audioFormat: 'mp3', videoFormat: 'mp4', filenamePattern: '{title}', fragments: 1, videoMode: 'combined', networkRetries: 2, rateLimitKiB: 0, theme: 'dark' }
export function fileName(pattern: string, title: string, index = 1, metadata: { author?: string; platform?: string } = {}) {
  return pattern.replaceAll('{title}', title).replaceAll('{index}', String(index)).replaceAll('{author}', metadata.author || '').replaceAll('{platform}', metadata.platform || '').replaceAll('{date}', new Date().toISOString().slice(0, 10)).replace(/[\x00-\x1f\x7f\\/*?:"<>|]/g, '').trim().slice(0, 100) || 'fetchly-download'
}
