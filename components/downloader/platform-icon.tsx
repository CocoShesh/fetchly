import Image from 'next/image'
import { Images } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlatformInfo } from '@/lib/platforms'

export function PlatformIcon({
  platform,
  className,
  tile = true,
}: {
  platform: PlatformInfo
  className?: string
  tile?: boolean
}) {
  const icon = ['pinterest', 'reddit', 'flickr'].includes(platform.id) ? <Images aria-label={`${platform.name} gallery`} className="size-full" /> : (
    <Image
      src={platform.icon || '/placeholder.svg'}
      alt={`${platform.name} logo`}
      width={20}
      height={20}
      className="size-full object-contain"
    />
  )

  if (!tile) return <span className={cn('inline-flex', className)}>{icon}</span>

  return (
    <span
      className={cn('inline-flex size-9 items-center justify-center rounded-xl p-2', className)}
      style={{ backgroundColor: `${platform.color}1a` }}
    >
      {icon}
    </span>
  )
}
