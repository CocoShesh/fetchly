'use client'

import { useState } from 'react'
import { ArrowDownToLine, Menu } from 'lucide-react'
import { BrandLogo } from '@/components/downloader/brand-logo'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet'

const NAV_LINKS = [
  { href: '/#platforms', label: 'Platforms' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/multiple', label: 'Multiple links' },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="site-container relative z-20 flex items-center justify-between gap-6 py-6">
      <a href="/#top" aria-label="Fetchly home" className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
        <BrandLogo />
      </a>

      <nav className="hidden items-center gap-8 text-sm text-muted-foreground lg:flex">
        {NAV_LINKS.map((link) => (
          <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
            {link.label}
          </a>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <a href="/#top" className="hidden items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_22px_-12px_color-mix(in_oklch,var(--primary)_75%,transparent)] transition-transform hover:-translate-y-0.5 sm:inline-flex">
          <ArrowDownToLine className="size-4" /> Start a download
        </a>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="rounded-full lg:hidden"
                aria-label="Open menu"
              />
            }
          >
            <Menu />
          </SheetTrigger>
          <SheetContent side="right" className="w-full max-w-xs">
            <SheetHeader>
              <SheetTitle className="flex items-center">
                <BrandLogo compact />
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {NAV_LINKS.map((link) => (
                <SheetClose
                  key={link.href}
                  render={
                    <a
                      href={link.href}
                      className="rounded-xl px-3 py-3 text-base font-medium text-foreground transition-colors hover:bg-secondary"
                    />
                  }
                >
                  {link.label}
                </SheetClose>
              ))}
            </nav>
            <SheetClose render={<a href="/#top" className="mx-4 mt-auto flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground" />}>
              <ArrowDownToLine className="size-4" /> Start a download
            </SheetClose>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
