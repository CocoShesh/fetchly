import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'

const FAQS = [
  { q: 'Can I save a playlist or photo collection?', a: 'Choose Playlist or Photo galleries above the link field. Select items and save them in a ZIP archive. Load more to browse longer collections; each archive accepts up to 100 selected items and the server file-size limit.' },
  { q: 'Is 8K available? Where will the file be saved?', a: 'All source resolutions are listed, including 8K when the platform exposes it. Fetchly does not upscale. Your browser controls the save folder; enable Ask where to save each file in browser settings to choose it each time.' },
  {
    q: 'Is this free to use?',
    a: 'Yes. Paste a link, pick a format, and download — no account, subscription, or watermark fees.',
  },
  {
    q: 'Will TikTok and Instagram downloads have a watermark?',
    a: 'Watermarks depend on the source the platform makes available. Watermark removal is not guaranteed.',
  },
  {
    q: 'Can I download audio only?',
    a: 'Yes. Choose MP3, M4A, FLAC, or Opus in Download preferences. Converting to FLAC does not improve the original audio quality.',
  },
  {
    q: 'Can I download login-required content?',
    a: "Import your own cookies.txt in Download preferences for content your account can access. The temporary session expires after 30 minutes. Deleted posts and DRM-protected media cannot be recovered.",
  },
  {
    q: 'Is my data stored anywhere?',
    a: "Prepared files and imported cookie sessions expire after 30 minutes. Appearance, filename preferences, and download history are saved in your browser; cookies and admin keys are not.",
  },
]

export function FaqSection() {
  return (
    <section id="faq" className="site-container relative py-16 sm:py-24">
      <div className="mx-auto mb-10 max-w-xl text-center">
        <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Good to know
        </h2>
      </div>

      <Accordion className="mx-auto flex max-w-3xl flex-col gap-2.5">
        {FAQS.map((item, i) => (
          <AccordionItem
            key={item.q}
            value={`item-${i}`}
            className="rounded-2xl border border-border bg-card/60 px-5 data-open:border-primary/30"
          >
            <AccordionTrigger className="py-4 text-left text-sm font-medium text-foreground hover:no-underline">
              {item.q}
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-sm text-muted-foreground">
              {item.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
