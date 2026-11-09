import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, inputClass } from '@/components/ui/Field';
import { toLocalInput } from '@/features/calendar/model';
import { useCreateMeeting, useUpdateMeeting } from './hooks';

const DURATIONS = [15, 30, 45, 60, 90, 120];

function nextHalfHour() {
  const date = new Date(Date.now() + 30 * 60_000);
  date.setMinutes(date.getMinutes() < 30 ? 30 : 60, 0, 0);
  return date;
}

/** Programar o editar una reunión de una clase. El código lo genera el servidor (uno distinto por reunión). */
export function MeetingDialog({ meeting, courses, defaultCourseId, onClose, onSaved }) {
  const editing = Boolean(meeting);
  const [courseId, setCourseId] = useState(String(meeting?.course.id ?? defaultCourseId ?? courses[0]?.id ?? ''));
  const [title, setTitle] = useState(meeting?.title ?? '');
  const [startsAt, setStartsAt] = useState(toLocalInput(meeting ? new Date(meeting.startsAt) : nextHalfHour()));
  const [duration, setDuration] = useState(String(meeting?.durationMinutes ?? 45));
  const [provider, setProvider] = useState(meeting?.provider ?? 'JITSI');
  const [externalUrl, setExternalUrl] = useState(meeting?.externalUrl ?? '');
  const [description, setDescription] = useState(meeting?.description ?? '');
  const [showProblems, setShowProblems] = useState(false);
  const create = useCreateMeeting();
  const update = useUpdateMeeting();
  const mutation = editing ? update : create;
  const effectiveCourseId = courseId || String(courses[0]?.id ?? '');

  const start = new Date(startsAt);
  const problems = [
    !effectiveCourseId && 'Elige la clase.',
    title.trim().length < 3 && 'El título debe tener al menos 3 caracteres.',
    Number.isNaN(start.getTime()) && 'Indica la fecha y hora.',
    provider === 'EXTERNAL' && !/^https:\/\/\S+$/.test(externalUrl.trim()) && 'Pega un enlace que empiece con https://',
  ].filter(Boolean);

  const save = () => {
    if (problems.length) return setShowProblems(true);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      startsAt: start.toISOString(),
      durationMinutes: Number(duration),
      provider,
      externalUrl: provider === 'EXTERNAL' ? externalUrl.trim() : null,
    };
    mutation.mutate(editing ? { meetingId: meeting.id, ...body } : { courseId: Number(effectiveCourseId), ...body }, {
      onSuccess: (saved) => (onSaved ? onSaved(saved) : onClose()),
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Editar reunión' : 'Programar reunión virtual'}
      description={editing ? `Código ${meeting.code} · se avisará a la clase del cambio.` : 'Se genera un código único para esta clase y se avisa a estudiantes y familias.'}
      className="max-w-lg"
      footer={
        <>
          {showProblems && problems.length > 0 && (
            <p role="alert" className="mr-auto flex items-center gap-1.5 self-center text-xs text-red-600">
              <AlertCircle className="size-3.5 shrink-0" /> {problems[0]}
            </p>
          )}
          <Button onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} loading={mutation.isPending}>
            {editing ? 'Guardar' : 'Programar'}
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => event.preventDefault()} className="space-y-4">
        <FormError error={mutation.error} />
        <Field label="Clase">
          {(id) => (
            <select id={id} value={effectiveCourseId} onChange={(e) => setCourseId(e.target.value)} disabled={editing} className={inputClass}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Título">
          {(id) => <input id={id} data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className={inputClass} placeholder="Ej. Repaso para el examen" />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fecha y hora">
            {(id) => <input id={id} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />}
          </Field>
          <Field label="Duración">
            {(id) => (
              <select id={id} value={duration} onChange={(e) => setDuration(e.target.value)} className={inputClass}>
                {[...new Set([...DURATIONS, Number(duration)])].sort((a, b) => a - b).map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes < 60 ? `${minutes} minutos` : `${minutes / 60} hora${minutes === 60 ? '' : 's'}`}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-zinc-700">Sala</legend>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input type="radio" name="provider" checked={provider === 'JITSI'} onChange={() => setProvider('JITSI')} className="mt-0.5 accent-brand-600" />
              <span>
                Sala automática de la plataforma
                <span className="block text-xs text-zinc-500">Se abre en el navegador con el código de la clase; no requiere cuenta.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-zinc-700">
              <input type="radio" name="provider" checked={provider === 'EXTERNAL'} onChange={() => setProvider('EXTERNAL')} className="mt-0.5 accent-brand-600" />
              <span>Enlace propio (Google Meet, Zoom, Teams)</span>
            </label>
            {provider === 'EXTERNAL' && (
              <input
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://meet.google.com/…"
                aria-label="Enlace de la reunión"
                className={inputClass}
              />
            )}
          </div>
        </fieldset>

        <Field label="Descripción" optional>
          {(id) => (
            <textarea
              id={id}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={1000}
              className="block w-full resize-y rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
