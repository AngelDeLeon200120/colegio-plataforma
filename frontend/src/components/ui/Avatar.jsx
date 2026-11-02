import { cn } from '@/lib/cn';

const palette = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
];

function colorFor(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

const sizes = { sm: 'size-7 text-[11px]', md: 'size-9 text-xs', lg: 'size-10 text-sm' };

export function Avatar({ firstName, lastName, size = 'md', className }) {
  const name = `${firstName} ${lastName}`;
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', sizes[size], colorFor(name), className)}
      aria-hidden
    >
      {firstName[0]}
      {lastName[0]}
    </span>
  );
}
