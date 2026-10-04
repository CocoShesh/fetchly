import type { Metadata } from 'next'
import { SiteHeader } from '@/components/downloader/site-header'
import { SiteFooter } from '@/components/downloader/site-footer'
import { MultipleDownloader } from '@/components/downloader/multiple-downloader'

export const metadata: Metadata = {
  title: 'Multiple links — Fetchly',
  description: 'Check multiple video and audio links, choose only the items you want, and save individual files or a ZIP archive.',
}
export default function MultipleLinksPage() {
  return <div className="relative isolate min-h-screen overflow-x-clip">
    <div aria-hidden="true" className="page-atmosphere pointer-events-none absolute inset-0 -z-10" />
    <SiteHeader />
    <main id="top" className="site-container pb-16 pt-10 sm:pb-24 sm:pt-16">
      <div className="mx-auto mb-9 max-w-3xl text-center">
        <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-foreground sm:text-5xl md:text-6xl">Your links. Your <span className="text-primary">selection.</span></h1>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">Paste several links, review their quality, and choose one, a few, or all. Save only what you want.</p>
      </div>
      <MultipleDownloader />
    </main>
    <SiteFooter />
  </div>
}
