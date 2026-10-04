'use client'
import Image from 'next/image'
import { LoaderCircle, RotateCcw } from 'lucide-react'
import { detectPlatform } from '@/lib/platforms'
import { PlatformIcon } from '@/components/downloader/platform-icon'
import { rowExpired, sourceChoices, type LinkRow } from '@/lib/multiple-links'

const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
export function MultipleLinkRow({ row, index, now, locked, onSelect, onChoice, onRetry }: {
  row: LinkRow; index: number; now: number; locked: boolean
  onSelect: (checked: boolean) => void; onChoice: (token: string) => void; onRetry: () => void
}) {
  const platform = detectPlatform(row.url)
  const expired = rowExpired(row, now)
  const ready = row.status === 'ready' && !expired
  const choices = sourceChoices(row.data)
  const title = row.data?.title || platform?.name || 'Unrecognized link'
  const thumbnail = row.data?.thumbnail
  const thumbnailUrl = thumbnail?.startsWith('https://') ? thumbnail : null
  return <li className="flex items-start gap-3 border-b border-border py-5 last:border-b-0 sm:gap-4">
    <label className={`flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg ${ready ? '' : 'opacity-40'}`}>
      <input type="checkbox" className={`size-5 accent-primary ${focus}`} checked={ready && row.selected} disabled={locked || !ready} onChange={event => onSelect(event.target.checked)} />
      <span className="sr-only">Select {title}, link {index + 1}</span>
    </label>
    <div className="hidden h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary sm:flex">
      {thumbnailUrl ? <Image src={thumbnailUrl} alt="" width={80} height={64} unoptimized referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : platform ? <PlatformIcon platform={platform} className="size-9" /> : <span className="text-muted-foreground">{index + 1}</span>}
    </div>
    <div className="min-w-0 flex-1 text-left">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{index + 1}</span>{platform && <><PlatformIcon platform={platform} tile={false} className="size-3.5" /><span>{platform.name}</span></>}
        <span className="ml-auto inline-flex items-center gap-1.5">{row.status === 'checking' && <LoaderCircle className="size-3 animate-spin" />}{expired ? 'Check again' : row.status === 'ready' ? 'Link checked' : row.status === 'error' ? 'Could not check' : row.status === 'checking' ? 'Checking…' : 'Waiting'}</span>
      </div>
      <p className="mt-2 break-words text-sm font-semibold leading-6 text-foreground">{title}</p>
      <p className="mt-1 break-all text-xs leading-5 text-muted-foreground">{row.url}</p>
      {row.error && <p className="mt-2 text-xs leading-5 text-destructive">{row.error}</p>}
      {expired && <p className="mt-2 text-xs text-muted-foreground">The source choices expired. Check this link again before downloading.</p>}
      {ready && <label className="mt-3 block text-xs text-muted-foreground">Format & source quality
        <select value={row.token || ''} disabled={locked} onChange={event => onChoice(event.target.value)} className={`mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground ${focus}`}>
          {choices.map(item => <option key={item.url} value={item.url}>{item.entryTitle && row.data?.collection ? `${item.entryTitle} · ` : ''}{item.kind === 'video' ? 'Video' : 'Audio only'} · {item.quality || item.label}{item.badge ? ` · ${item.badge}` : ''}</option>)}
        </select>
      </label>}
      {row.saveState && <p role="status" className="mt-2 text-xs text-primary">{row.saveState === 'preparing' ? 'Preparing file…' : row.saveState === 'ready' ? 'Ready on server · save again anytime while available' : 'File needs retry'}</p>}
      {row.saveError && <p className="mt-2 text-xs leading-5 text-destructive">{row.saveError}</p>}
      {(row.status === 'error' || row.status === 'waiting' || row.status === 'ready') && <button type="button" disabled={locked} onClick={onRetry} className={`mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-xs font-medium text-primary disabled:opacity-50 ${focus}`}><RotateCcw className="size-3.5" />{row.status === 'ready' ? 'Check again' : 'Retry link'}</button>}
    </div>
  </li>
}
