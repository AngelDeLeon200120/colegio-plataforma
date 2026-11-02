import { useId } from 'react';
import { AlertCircle } from 'lucide-react';

export const inputClass =
  'h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none disabled:bg-zinc-50 disabled:text-zinc-500';

/** Etiqueta + control. `children` recibe el id para enlazar el <label>. */
export function Field({ label, hint, optional, children, className }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-700">
        {label} {optional && <span className="font-normal text-zinc-400">(opcional)</span>}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export function FormError({ error }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {error.message}
    </p>
  );
}
