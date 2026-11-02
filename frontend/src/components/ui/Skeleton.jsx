import { cn } from '@/lib/cn';

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-zinc-200/70', className)} aria-hidden />;
}
