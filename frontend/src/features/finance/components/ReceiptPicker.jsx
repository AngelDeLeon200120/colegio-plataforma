import { useRef } from 'react';
import { FileImage, FileText, Paperclip, X } from 'lucide-react';
import { formatBytes } from '@/lib/format';

export const RECEIPT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'];
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

/** Mensaje de error si el archivo no sirve como comprobante; null si está bien. */
export function receiptProblem(file) {
  const extension = file.name.toLowerCase().split('.').pop();
  if (!RECEIPT_EXTENSIONS.includes(extension)) return 'Usa una foto (JPG, PNG, WEBP, HEIC) o un PDF.';
  if (file.size > MAX_RECEIPT_BYTES) return `El archivo pesa ${formatBytes(file.size)}; el máximo es 10 MB.`;
  return null;
}

/** Elegir la foto o el PDF de la boleta. */
export function ReceiptPicker({ file, onChange, problem, label = 'Adjuntar foto o PDF' }) {
  const input = useRef(null);
  const Icon = file?.name.toLowerCase().endsWith('.pdf') ? FileText : FileImage;
  return (
    <div className="space-y-1">
      <input
        ref={input}
        type="file"
        accept={RECEIPT_EXTENSIONS.map((extension) => `.${extension}`).join(',') + ',image/*,application/pdf'}
        className="hidden"
        onChange={(event) => {
          onChange(event.target.files[0] ?? null);
          event.target.value = '';
        }}
      />
      {file ? (
        <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm">
          <Icon className="size-4 shrink-0 text-zinc-400" />
          <span className="min-w-0 flex-1 truncate font-medium text-zinc-700">{file.name}</span>
          <span className="shrink-0 text-xs text-zinc-400">{formatBytes(file.size)}</span>
          <button type="button" onClick={() => onChange(null)} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700" aria-label="Quitar comprobante">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current.click()}
          className="flex w-full items-center gap-2 rounded-md border border-dashed border-zinc-300 px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50"
        >
          <Paperclip className="size-4 shrink-0" />
          <span>
            {label}
            <span className="block text-xs text-zinc-400">JPG, PNG, WEBP, HEIC o PDF · hasta 10 MB</span>
          </span>
        </button>
      )}
      {problem && <p className="text-xs text-red-600">{problem}</p>}
    </div>
  );
}
