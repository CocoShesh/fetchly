export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-3">
      <svg aria-hidden="true" viewBox="0 0 40 40" fill="none" className={compact ? 'size-8 shrink-0' : 'size-10 shrink-0'}>
        <rect width="40" height="40" rx="12" fill="currentColor" className="text-primary" />
        <path d="M12 28V12H26M12 19H21" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground" />
        <path d="M26 20V29M22 25L26 29L30 25" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground" />
      </svg>
      <span className={`font-display font-semibold leading-none tracking-[-0.03em] text-foreground ${compact ? 'text-lg' : 'text-2xl'}`}>Fetchly</span>
    </span>
  )
}
