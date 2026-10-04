import { BrandLogo } from '@/components/downloader/brand-logo'

export function SiteFooter() {
  return (
    <footer className="site-container relative py-10">
      <div className="flex flex-col items-center gap-5 border-t border-border pt-8 sm:flex-row sm:justify-between">
        <a href="/#top" aria-label="Fetchly home" className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          <BrandLogo compact />
        </a>

        <p className="max-w-md text-center text-xs text-muted-foreground sm:text-right">
          Built for downloading content you own or have the right to use. Respect creators and
          platform terms of service.
        </p>
      </div>
    </footer>
  )
}
