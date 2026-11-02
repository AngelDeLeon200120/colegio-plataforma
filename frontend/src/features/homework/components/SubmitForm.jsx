import { useId, useRef, useState } from 'react';
import { AlertCircle, FileImage, FileText, Paperclip, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { ACCEPTED_EXTENSIONS, MAX_FILES, MAX_FILE_BYTES } from '../model';

const extensionOf = (name) => name.toLowerCase().split('.').pop();

/** Revisa en el navegador lo mismo que el servidor, para avisar antes de subir. */
function validateFiles(current, incoming) {
  const accepted = [...current];
  const problems = [];
  for (const file of incoming) {
    if (!ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))) problems.push(`${file.name}: formato no permitido`);
    else if (file.size > MAX_FILE_BYTES) problems.push(`${file.name}: supera ${formatBytes(MAX_FILE_BYTES)}`);
    else if (accepted.length >= MAX_FILES) problems.push(`Máximo ${MAX_FILES} archivos por entrega`);
    else if (!accepted.some((f) => f.name === file.name && f.size === file.size)) accepted.push(file);
  }
  return { accepted, problems: [...new Set(problems)] };
}

export function SubmitForm({ isResubmission, lateWarning, onSubmit }) {
  const [files, setFiles] = useState([]);
  const [comment, setComment] = useState('');
  const [problems, setProblems] = useState([]);
  const [progress, setProgress] = useState(null); // null | 0..1
  const [error, setError] = useState(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const commentId = useId();

  const sending = progress !== null;

  const addFiles = (list) => {
    const result = validateFiles(files, [...list]);
    setFiles(result.accepted);
    setProblems(result.problems);
    setError(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!files.length || sending) return;
    setError(null);
    setProgress(0);
    try {
      await onSubmit({ files, comment: comment.trim() }, setProgress);
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          addFiles(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-lg border-2 border-dashed p-4 transition-colors',
          over ? 'border-blue-400 bg-blue-50' : 'border-zinc-200',
        )}
      >
        {files.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {files.map((file) => {
              const Icon = file.type.startsWith('image/') ? FileImage : FileText;
              return (
                <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 rounded-md bg-zinc-50 px-2.5 py-1.5 text-sm ring-1 ring-zinc-200">
                  <Icon className="size-4 shrink-0 text-zinc-400" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-zinc-400">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => setFiles(files.filter((f) => f !== file))}
                    aria-label={`Quitar ${file.name}`}
                    className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col items-center gap-1 text-center">
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={sending || files.length >= MAX_FILES}>
            <Paperclip className="size-3.5" /> {files.length ? 'Agregar otro archivo' : 'Elegir archivos'}
          </Button>
          <p className="text-xs text-zinc-500">
            o arrástralos aquí · PDF, fotos, Word, Excel, PowerPoint o ZIP · hasta {MAX_FILES} de {formatBytes(MAX_FILE_BYTES)}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {problems.length > 0 && (
        <ul className="space-y-0.5 text-xs text-amber-700">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5">
        <label htmlFor={commentId} className="block text-sm font-medium text-zinc-700">
          Comentario para tu docente <span className="font-normal text-zinc-400">(opcional)</span>
        </label>
        <textarea
          id={commentId}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          maxLength={2000}
          disabled={sending}
          placeholder={isResubmission ? 'Cuéntale qué corregiste' : 'Algo que quieras aclarar sobre tu trabajo'}
          className="block w-full resize-none rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" className="h-9" disabled={!files.length} loading={sending}>
          {!sending && <Send className="size-3.5" />}
          {isResubmission ? 'Enviar corrección' : 'Entregar'}
        </Button>
        {sending && (
          <div className="flex min-w-40 flex-1 items-center gap-2" aria-live="polite">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-blue-500 transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span className="text-xs text-zinc-500 tabular-nums">{Math.round(progress * 100)}%</span>
          </div>
        )}
        {!sending && lateWarning && <span className="text-xs text-amber-700">{lateWarning}</span>}
      </div>
    </form>
  );
}
