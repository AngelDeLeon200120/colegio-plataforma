import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function SaveIndicator({ status, pendingCount, errorCount, readOnly, onRetry }) {
  if (readOnly) return null;

  let content;
  if (status.state === 'error') {
    content = (
      <span className="flex items-center gap-2 text-red-600">
        <AlertCircle className="size-3.5" />
        <span className="max-w-64 truncate" title={status.message}>
          No se guardó: {status.message}
        </span>
        <Button size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      </span>
    );
  } else if (status.state === 'saving' || pendingCount > 0) {
    content = (
      <span className="flex items-center gap-1.5 text-zinc-500">
        <Loader2 className="size-3.5 animate-spin" /> Guardando…
      </span>
    );
  } else if (status.state === 'saved') {
    content = (
      <span className="flex items-center gap-1.5 text-zinc-500">
        <Check className="size-3.5 text-emerald-600" /> Guardado
      </span>
    );
  } else {
    content = <span className="text-zinc-400">Los cambios se guardan solos</span>;
  }

  return (
    <div className="flex items-center gap-3 text-xs" aria-live="polite">
      {errorCount > 0 && (
        <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700 ring-1 ring-red-100">
          {errorCount} celda(s) con error sin guardar
        </span>
      )}
      {content}
    </div>
  );
}
