import { cn } from '@/lib/cn';

export function Kbd({ className, children }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border border-current/20 px-1 font-sans text-[10px] font-medium opacity-70',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
