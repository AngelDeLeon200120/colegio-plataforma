import { useEffect, useId, useState } from 'react';
import { AlertCircle, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { cn } from '@/lib/cn';
import { FEEDBACK_SNIPPETS, MIN_FEEDBACK_LENGTH } from '../constants';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Formulario de revisión. Se monta con `key={submission.id}` para reiniciar
 * su estado al cambiar de alumno.
 */
export function ReviewComposer({ maxScore, pendingDecision, error, onSubmit }) {
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [touchedReject, setTouchedReject] = useState(false);
  const scoreId = useId();
  const feedbackId = useId();

  const trimmed = feedback.trim();
  const parsedScore = score === '' ? null : Number(score);
  const scoreInvalid = parsedScore !== null && (Number.isNaN(parsedScore) || parsedScore < 0 || (maxScore !== null && parsedScore > maxScore));
  const canReject = trimmed.length >= MIN_FEEDBACK_LENGTH;
  const busy = Boolean(pendingDecision);

  const approve = () => {
    if (scoreInvalid || busy) return;
    onSubmit('APPROVED', { score: parsedScore, feedback: trimmed || null });
  };

  const reject = () => {
    setTouchedReject(true);
    if (!canReject || busy) return;
    onSubmit('REJECTED', { feedback: trimmed });
  };

  const addSnippet = (snippet) => setFeedback((current) => (current.trim() ? `${current.trimEnd()} ${snippet}` : snippet));

  // Atajos globales mientras el formulario está visible
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      if (event.shiftKey) reject();
      else approve();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="border-t border-zinc-200 bg-white p-4">
      <div className="rounded-xl border border-zinc-200 shadow-xs focus-within:border-zinc-300 focus-within:ring-2 focus-within:ring-zinc-100">
        <label htmlFor={feedbackId} className="sr-only">
          Retroalimentación
        </label>
        <textarea
          id={feedbackId}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          rows={2}
          maxLength={5000}
          placeholder="Escribe la retroalimentación para el alumno. Es obligatoria para solicitar corrección."
          aria-invalid={touchedReject && !canReject}
          className="block w-full resize-none rounded-t-xl bg-transparent px-3 pt-3 text-sm placeholder:text-zinc-400 focus:outline-none"
        />
        <div className="flex gap-1.5 overflow-x-auto px-3 pt-1 pb-2.5 [scrollbar-width:none]">
          {FEEDBACK_SNIPPETS.map((snippet) => (
            <button
              key={snippet}
              type="button"
              onClick={() => addSnippet(snippet)}
              className="shrink-0 rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
            >
              + {snippet}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-100 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <label htmlFor={scoreId} className="text-xs font-medium text-zinc-600">
              Nota
            </label>
            <div
              className={cn(
                'flex h-8 items-center rounded-md border bg-white pr-2 text-sm',
                scoreInvalid ? 'border-red-300 ring-2 ring-red-100' : 'border-zinc-200',
              )}
            >
              <input
                id={scoreId}
                type="number"
                inputMode="decimal"
                min={0}
                max={maxScore ?? undefined}
                step={0.5}
                value={score}
                onChange={(event) => setScore(event.target.value)}
                placeholder="—"
                aria-invalid={scoreInvalid}
                className="w-14 bg-transparent px-2 text-right tabular-nums focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              {maxScore !== null && <span className="text-zinc-400 tabular-nums">/ {maxScore}</span>}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="warning" onClick={reject} loading={pendingDecision === 'REJECTED'} disabled={busy && pendingDecision !== 'REJECTED'}>
              {pendingDecision !== 'REJECTED' && <RotateCcw className="size-3.5" />}
              Solicitar corrección
            </Button>
            <Button variant="primary" onClick={approve} loading={pendingDecision === 'APPROVED'} disabled={scoreInvalid || (busy && pendingDecision !== 'APPROVED')}>
              {pendingDecision !== 'APPROVED' && <Check className="size-3.5" />}
              Aprobar
              <Kbd className="ml-0.5 hidden sm:inline-flex">{isMac ? '⌘' : 'Ctrl'}↵</Kbd>
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-2 min-h-5 text-xs" aria-live="polite">
        {error ? (
          <p className="flex items-center gap-1.5 text-red-600">
            <AlertCircle className="size-3.5" /> {error.message}
          </p>
        ) : touchedReject && !canReject ? (
          <p className="flex items-center gap-1.5 text-amber-700">
            <AlertCircle className="size-3.5" /> Explica qué debe corregir el alumno (mínimo {MIN_FEEDBACK_LENGTH} caracteres).
          </p>
        ) : scoreInvalid ? (
          <p className="text-red-600">La nota debe estar entre 0 y {maxScore}.</p>
        ) : (
          <p className="text-zinc-400">
            Al solicitar corrección, el alumno y sus encargados recibirán recordatorios hasta que reenvíe.
          </p>
        )}
      </div>
    </div>
  );
}
