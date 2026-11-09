import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, History, Info, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, inputClass } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Skeleton';
import { api } from '@/lib/apiClient';
import { formatDateTime, formatScore } from '@/lib/format';
import { ERROR_LABELS, parseInput } from '../gridModel';
import { mergeScores } from '../hooks';

const historyKey = (courseId, itemId, studentId) => ['gradebook-history', String(courseId), itemId, studentId];

/**
 * "Mejora": cambia una nota aunque la entrega ya esté aprobada (recuperación, corrección).
 * Queda en el historial con quién y cuándo; no se envía ninguna notificación.
 */
export function ImproveDialog({ courseId, unitId, student, item, currentScore, sheetKey, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState(currentScore === null || currentScore === undefined ? '' : String(currentScore));
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  const history = useQuery({
    queryKey: historyKey(courseId, item.id, student.id),
    queryFn: () => api(`/courses/${courseId}/gradebook/history?gradeItemId=${item.id}&studentId=${student.id}`),
  });

  const improve = useMutation({
    mutationFn: (body) => api(`/courses/${courseId}/gradebook/improvements`, { method: 'POST', body }),
    onSuccess: (result) => {
      queryClient.setQueryData(sheetKey, (sheet) => mergeScores(sheet, [result.cell]));
      queryClient.setQueryData(historyKey(courseId, item.id, student.id), { history: result.history });
      onSaved?.(result);
    },
  });

  const parsed = parseInput(raw, item.maxScore);
  const unchanged = !parsed.error && parsed.value === (currentScore ?? null);
  const problem = parsed.error
    ? `${ERROR_LABELS[parsed.error]}${parsed.error === 'SCORE_OUT_OF_RANGE' ? ` (0 a ${formatScore(item.maxScore)})` : ''}`
    : unchanged
      ? 'Escribe una nota distinta a la actual.'
      : null;

  const save = () => {
    setTouched(true);
    if (problem) return;
    improve.mutate({ unitId, gradeItemId: item.id, studentId: student.id, score: parsed.value, note: note.trim() || null });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Mejora de nota"
      description={`${student.lastName}, ${student.firstName} · ${item.name} (máx. ${formatScore(item.maxScore)})`}
      className="max-w-lg"
      footer={
        <>
          <Button onClick={onClose} disabled={improve.isPending}>
            Cerrar
          </Button>
          <Button variant="primary" onClick={save} loading={improve.isPending}>
            <Sparkles className="size-4" /> Guardar mejora
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <FormError error={improve.error} />
        {improve.isSuccess && (
          <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 ring-1 ring-blue-100">
            Mejora guardada. La celda queda marcada en azul.
          </p>
        )}

        <p className="flex items-start gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Funciona aunque la entrega ya esté aprobada.
            {item.activityId && ' Como la columna viene de una actividad, la nota aprobada que ven el estudiante y su familia también se actualiza.'} No se envían
            notificaciones.
          </span>
        </p>

        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div>
            <p className="mb-1.5 text-sm font-medium text-zinc-700">Nota actual</p>
            <p className="flex h-9 items-center rounded-md bg-zinc-100 px-3 text-sm text-zinc-700 tabular-nums">{formatScore(currentScore ?? null)}</p>
          </div>
          <ArrowRight className="mb-2.5 size-4 text-zinc-400" />
          <Field label="Nota mejorada">
            {(id) => (
              <input
                id={id}
                data-autofocus
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                inputMode="decimal"
                aria-invalid={Boolean(touched && problem) || undefined}
                className={`${inputClass} text-right font-semibold text-blue-700 tabular-nums`}
              />
            )}
          </Field>
        </div>
        {touched && problem && <p className="-mt-2 text-xs text-red-600">{problem}</p>}

        <Field label="Motivo" optional>
          {(id) => <input id={id} value={note} onChange={(event) => setNote(event.target.value)} maxLength={255} placeholder="Ej. Recuperación, revisión de examen" className={inputClass} />}
        </Field>

        <section>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-zinc-700">
            <History className="size-4" /> Historial de mejoras
          </h3>
          {history.isLoading && <Skeleton className="h-12 w-full" />}
          {history.isError && <p className="text-xs text-red-600">{history.error.message}</p>}
          {history.data && history.data.history.length === 0 && <p className="text-xs text-zinc-500">Esta nota no tiene mejoras anteriores.</p>}
          {history.data?.history.length > 0 && (
            <ol className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {history.data.history.map((change) => (
                <li key={change.id} className="flex flex-wrap items-baseline gap-x-2 px-3 py-2 text-sm">
                  <span className="text-zinc-500 tabular-nums line-through">{formatScore(change.oldScore)}</span>
                  <ArrowRight className="size-3 self-center text-zinc-400" />
                  <span className="font-semibold text-blue-700 tabular-nums">{formatScore(change.newScore)}</span>
                  {change.note && <span className="text-zinc-700">· {change.note}</span>}
                  <span className="ml-auto text-xs text-zinc-500">
                    {change.changedBy} · {formatDateTime(change.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </form>
    </Dialog>
  );
}
