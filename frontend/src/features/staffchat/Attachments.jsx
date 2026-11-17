import { useState } from 'react';
import { FileText, ImageOff, Loader2, X } from 'lucide-react';
import { FileChip } from '@/components/ui/FileChip';
import { useImageUrl } from '@/features/feed/hooks';
import { openFile } from '@/lib/apiClient';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';

// Lo mismo que acepta el servidor: documentos e imágenes de siempre + videos, hasta 50 MB y 5 por mensaje
export const CHAT_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'heic',
  'heif',
  'docx',
  'xlsx',
  'pptx',
  'zip',
  'doc',
  'xls',
  'ppt',
  'mp4',
  'm4v',
  'mov',
  'webm',
];
export const MAX_FILES = 5;
export const MAX_BYTES = 50 * 1024 * 1024;

const extensionOf = (name) => name.toLowerCase().split('.').pop();
const isImage = (file) => ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extensionOf(file.name));
const isVideo = (file) => ['mp4', 'm4v', 'mov', 'webm'].includes(extensionOf(file.name));

/** Revisa los archivos elegidos; devuelve los válidos y el primer problema encontrado. */
export function checkFiles(current, incoming) {
  const accepted = [];
  let problem = null;
  for (const file of incoming) {
    if (current.length + accepted.length >= MAX_FILES) {
      problem = `Máximo ${MAX_FILES} archivos por mensaje.`;
      break;
    }
    if (!CHAT_EXTENSIONS.includes(extensionOf(file.name)))
      problem = `«${file.name}» no es un formato permitido (fotos, videos, PDF, Word, Excel, PowerPoint, ZIP).`;
    else if (file.size > MAX_BYTES) problem = `«${file.name}» pesa ${formatBytes(file.size)}; el máximo es 50 MB.`;
    else accepted.push(file);
  }
  return { accepted, problem };
}

/** Archivos elegidos antes de enviar, con miniatura de las fotos. */
export function PendingFiles({ files, onRemove, disabled }) {
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2 border-t border-zinc-200 bg-white px-4 pt-3 sm:px-6">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${file.size}-${index}`}
          className="relative flex max-w-56 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-1.5 pr-7 text-xs"
        >
          {isImage(file) ? (
            <img
              src={URL.createObjectURL(file)}
              alt=""
              className="size-10 rounded object-cover"
              onLoad={(event) => URL.revokeObjectURL(event.currentTarget.src)}
            />
          ) : (
            <span className="flex size-10 items-center justify-center rounded bg-white text-[10px] font-semibold text-zinc-500 uppercase ring-1 ring-zinc-200">
              {isVideo(file) ? '▶' : extensionOf(file.name)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium text-zinc-800">{file.name}</span>
            <span className="text-zinc-500">{formatBytes(file.size)}</span>
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute top-1 right-1 rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
              aria-label={`Quitar ${file.name}`}
            >
              <X className="size-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function ImageAttachment({ file }) {
  const { data: url, isLoading, isError } = useImageUrl(file.id);
  if (isLoading)
    return (
      <span className="flex size-40 items-center justify-center rounded-lg bg-zinc-100">
        <Loader2 className="size-5 animate-spin text-zinc-400" />
      </span>
    );
  if (isError || !url)
    return (
      <span className="flex size-40 items-center justify-center rounded-lg bg-zinc-100">
        <ImageOff className="size-5 text-zinc-400" />
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => openFile(file.id)}
      className="block overflow-hidden rounded-lg ring-1 ring-zinc-200 hover:opacity-90"
      title={`Abrir ${file.name}`}
    >
      <img src={url} alt={file.name} className="max-h-64 max-w-full object-cover" loading="lazy" />
    </button>
  );
}

function VideoAttachment({ file }) {
  // La URL firmada dura 5 minutos: si caduca mientras se adelanta, se pide otra
  const { data: url, isLoading, refetch } = useImageUrl(file.id);
  const [failed, setFailed] = useState(false);
  if (isLoading || !url)
    return (
      <span className="flex h-40 w-64 items-center justify-center rounded-lg bg-zinc-900">
        <Loader2 className="size-5 animate-spin text-zinc-400" />
      </span>
    );
  return (
    <span className="block max-w-sm">
      <video
        src={url}
        controls
        preload="metadata"
        className="max-h-72 w-full rounded-lg bg-black"
        onError={() => {
          if (!failed) {
            setFailed(true);
            refetch();
          }
        }}
      >
        <track kind="captions" />
      </video>
      <span className="mt-0.5 block truncate text-[11px] opacity-70">
        {file.name} · {formatBytes(file.size)}
      </span>
    </span>
  );
}

/** Adjuntos dentro de la burbuja del mensaje. */
export function MessageAttachments({ attachments, mine }) {
  if (!attachments?.length) return null;
  const images = attachments.filter(isImage);
  const videos = attachments.filter(isVideo);
  const others = attachments.filter((file) => !isImage(file) && !isVideo(file));
  return (
    <span className={cn('flex flex-col gap-1.5', mine && 'items-end')}>
      {images.length > 0 && (
        <span className={cn('grid gap-1.5', images.length > 1 && 'grid-cols-2')}>
          {images.map((file) => (
            <ImageAttachment key={file.id} file={file} />
          ))}
        </span>
      )}
      {videos.map((file) => (
        <VideoAttachment key={file.id} file={file} />
      ))}
      {others.map((file) => (
        <FileChip key={file.id} file={file} />
      ))}
    </span>
  );
}

export function DropOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-brand-50/90 ring-2 ring-brand-400 ring-inset">
      <p className="flex items-center gap-2 text-sm font-medium text-brand-800">
        <FileText className="size-5" /> Suelta aquí las fotos, videos o archivos
      </p>
    </div>
  );
}
