import { SiteHeader } from '@/components/downloader/site-header'
import { HeroSection } from '@/components/downloader/hero-section'
import { PlatformGrid } from '@/components/downloader/platform-grid'
import { HowItWorks } from '@/components/downloader/how-it-works'
import { FaqSection } from '@/components/downloader/faq-section'
import { SiteFooter } from '@/components/downloader/site-footer'

export default function Page() {
  return (
    <div className="relative isolate min-h-screen overflow-x-clip">
      <div aria-hidden="true" className="page-atmosphere pointer-events-none absolute inset-0 -z-10" />
      <SiteHeader />
      <main>
        <HeroSection />
        <PlatformGrid />
        <HowItWorks />
        <FaqSection />
      </main>
      <SiteFooter />
    </div>
  )
}
