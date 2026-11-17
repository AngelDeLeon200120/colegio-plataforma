import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, inputClass } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { useUpdateFollowup } from './hooks';
import { DECISIONS } from './model';

function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/**
 * La institución decide el seguimiento: la medida y la fecha (la familia recibe la citación),
 * notas internas y, al final, los acuerdos para marcarlo resuelto.
 */
export function FollowupDialog({ followup, onClose }) {
  const update = useUpdateFollowup();
  const [decision, setDecision] = useState(followup.decision ?? 'CITA_FAMILIA');
  const [meetingAt, setMeetingAt] = useState(toLocalInput(followup.meetingAt));
  const [notes, setNotes] = useState(followup.notes ?? '');
  const [outcome, setOutcome] = useState(followup.outcome ?? '');
  const name = `${followup.student.firstName} ${followup.student.lastName}`;

  const save = (status) =>
    update.mutate(
      {
        followupId: followup.id,
        status,
        decision,
        meetingAt: meetingAt ? new Date(meetingAt).toISOString() : null,
        notes: notes.trim() || null,
        outcome: outcome.trim() || null,
      },
      { onSuccess: onClose },
    );

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Seguimiento · ${name}`}
      description={`Llegó a ${followup.reportCount} reportes en el ciclo${followup.section ? ` · ${followup.section.name}` : ''}.`}
      className="max-w-lg"
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => save(followup.status === 'RESUELTO' ? 'RESUELTO' : meetingAt ? 'PROGRAMADO' : 'PENDIENTE')} loading={update.isPending}>
            Guardar
          </Button>
          <Button variant="primary" onClick={() => save('RESUELTO')} loading={update.isPending} disabled={!outcome.trim()}>
            Marcar resuelto
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => event.preventDefault()} className="space-y-4">
        <FormError error={update.error} />
        <div>
          <p className="mb-1.5 text-sm font-medium text-zinc-700">Medida</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Medida">
            {Object.entries(DECISIONS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={decision === key}
                onClick={() => setDecision(key)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium',
                  decision === key ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Fecha y hora de la reunión" hint="Al guardarla, la familia recibe la citación con la fecha.">
          {(id) => <input id={id} type="datetime-local" value={meetingAt} onChange={(event) => setMeetingAt(event.target.value)} className={inputClass} />}
        </Field>
        <Field label="Notas internas" optional hint="Solo las ve el personal del colegio.">
          {(id) => (
            <textarea
              id={id}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              maxLength={2000}
              className="block w-full resize-y rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
            />
          )}
        </Field>
        <Field label="Acuerdos" optional hint="Lo que se acordó en la reunión. Lo ve la familia. Necesario para marcarlo resuelto.">
          {(id) => (
            <textarea
              id={id}
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
              rows={3}
              maxLength={2000}
              className="block w-full resize-y rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
