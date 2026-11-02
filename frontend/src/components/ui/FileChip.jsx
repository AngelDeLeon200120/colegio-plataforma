import { useState } from 'react';
import { FileImage, FileText, Loader2 } from 'lucide-react';
import { openFile } from '@/lib/apiClient';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';

/** Archivo adjunto: al hacer clic se abre en otra pestaña con una URL firmada. */
export function FileChip({ file, className }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState(null);
  const Icon = file.mimeType?.startsWith('image/') ? FileImage : FileText;

  const open = async () => {
    setOpening(true);
    setError(null);
    try {
      await openFile(file.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setOpening(false);
    }
  };

  return (
    <span className={cn('inline-flex max-w-full flex-col', className)}>
      <button
        type="button"
        onClick={open}
        disabled={opening}
        className="group inline-flex max-w-full items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-left text-sm shadow-xs transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-70"
      >
        {opening ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-zinc-400" />
        ) : (
          <Icon className="size-4 shrink-0 text-zinc-400 group-hover:text-zinc-600" />
        )}
        <span className="truncate font-medium text-zinc-700">{file.name}</span>
        {file.size !== undefined && <span className="shrink-0 text-xs text-zinc-400">{formatBytes(file.size)}</span>}
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  );
}
