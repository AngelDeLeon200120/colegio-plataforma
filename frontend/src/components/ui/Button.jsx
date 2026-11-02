import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

// Botones tipo píldora (Material): principal relleno en azul, secundario con borde y texto azul
const variants = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 hover:shadow-card',
  secondary: 'border border-zinc-300 bg-white text-brand-700 hover:bg-brand-50',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
  warning: 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100',
};

const sizes = {
  sm: 'h-8 gap-1.5 px-3.5 text-xs',
  md: 'h-9 gap-2 px-5 text-sm',
  icon: 'size-9',
};

export function Button({ variant = 'secondary', size = 'md', loading = false, className, disabled, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium tracking-wide whitespace-nowrap transition-all',
        'focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-1 focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
