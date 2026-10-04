import { PLATFORMS } from '@/lib/platforms'
import { PlatformIcon } from '@/components/downloader/platform-icon'

export function PlatformGrid() {
  return (
    <section id="platforms" className="site-container relative py-16 sm:py-24">
      <div className="mx-auto mb-12 max-w-xl text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Videos and galleries. One place.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Video support for the original five platforms, plus photo galleries from Pinterest, Reddit, and Flickr. Availability depends on platform access.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {PLATFORMS.map((platform) => (
          <div
            key={platform.id}
            className="group relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card/60 px-4 py-7 text-center transition-all hover:-translate-y-0.5 hover:border-border/60"
          >
            <div
              className="absolute inset-x-6 top-0 h-20 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-20"
              style={{ backgroundColor: platform.color }}
              aria-hidden
            />
            <PlatformIcon platform={platform} className="relative size-11 p-2.5" />
            <div className="relative">
              <p className="text-sm font-semibold text-foreground">{platform.name}</p>
              {platform.badge && (
                <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                  {platform.badge}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
