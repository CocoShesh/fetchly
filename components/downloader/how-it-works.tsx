import { Link2, ScanLine, DownloadCloud } from 'lucide-react'

const STEPS = [
  {
    icon: Link2,
    title: 'Copy the link',
    description: 'Grab the share link from YouTube, TikTok, Instagram, Facebook, or X.',
  },
  {
    icon: ScanLine,
    title: 'Paste & detect',
    description: 'Fetchly recognizes the platform instantly and checks available video and audio streams.',
  },
  {
    icon: DownloadCloud,
    title: 'Pick & save',
    description: 'Choose a video, audio, or photo format. Save individual files or selected collections as ZIP archives.',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="site-container relative py-16 sm:py-24" aria-labelledby="how-it-works-title">
      <div className="mb-10 flex flex-col gap-4 border-t border-border pt-12 md:mb-12 md:flex-row md:items-end md:justify-between md:gap-12">
        <h2 id="how-it-works-title" className="font-display max-w-md text-balance text-3xl font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-4xl">
          Three steps. Zero friction.
        </h2>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          Built to be the fastest way to save a video — no installs, no hidden upsells.
        </p>
      </div>
      <ol className="grid gap-8 md:grid-cols-3 md:gap-0">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-5 border-b border-border pb-8 last:border-b-0 md:block md:border-b-0 md:border-r md:pr-8 md:pb-0 md:last:border-r-0 md:not-first:pl-8">
            <div className="flex shrink-0 self-start items-center gap-4 pt-1 md:mb-6 md:self-auto md:justify-between md:pt-0">
              <span aria-hidden="true" className="font-display text-4xl font-medium leading-none tracking-[-0.03em] tabular-nums text-primary">{i + 1}</span>
              <step.icon aria-hidden="true" className="hidden size-6 text-muted-foreground md:block" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-lg font-semibold leading-7 text-foreground">{step.title}</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
