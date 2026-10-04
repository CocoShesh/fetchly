import { Badge } from '@/components/ui/badge'
import { HeroDownloader } from '@/components/downloader/hero-downloader'

export function HeroSection() {
  return (
    <section id="top" className="site-container relative pb-20 pt-10 sm:pb-24 sm:pt-16">
      <div className="flex flex-col items-center text-center">
        <Badge variant="secondary" className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-medium text-muted-foreground">
          Highest available source quality
        </Badge>

        <h1 className="font-display mt-6 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-foreground sm:text-5xl md:text-6xl">
          Save the best version <span className="text-primary">available.</span>
        </h1>

        <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          Save videos at the highest available source quality, extract audio, collect playlists, or archive photo galleries. Choose your format and make it yours.
        </p>

        <div className="mt-9 w-full">
          <HeroDownloader />
        </div>
      </div>
    </section>
  )
}
