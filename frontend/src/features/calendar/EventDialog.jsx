import { useState } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, inputClass } from '@/components/ui/Field';
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from './hooks';
import { CATEGORY_LOOK, toLocalInput } from './model';

/** Crear o editar un evento del calendario general (solo administración). */
export function EventDialog({ event, defaults, sections = [], onClose }) {
  const editing = Boolean(event);
  const initialStart = editing ? new Date(event.startsAt) : (defaults?.start ?? new Date());
  const initialEnd = editing ? new Date(event.endsAt) : (defaults?.end ?? new Date(initialStart.getTime() + 60 * 60_000));

  const [title, setTitle] = useState(event?.title ?? '');
  const [category, setCategory] = useState(event?.category ?? 'GENERAL');
  const [allDay, setAllDay] = useState(event?.allDay ?? defaults?.allDay ?? false);
  const [start, setStart] = useState(toLocalInput(initialStart, !allDay));
  const [end, setEnd] = useState(toLocalInput(initialEnd, !allDay));
  const [location, setLocation] = useState(event?.location ?? '');
  const [sectionId, setSectionId] = useState(String(event?.section?.id ?? ''));
  const [description, setDescription] = useState(event?.description ?? '');
  const [showProblems, setShowProblems] = useState(false);

  const create = useCreateEvent();
  const update = useUpdateEvent();
  const remove = useDeleteEvent();
  const mutation = editing ? update : create;

  // Al cambiar a "todo el día" los campos pasan de fecha y hora a solo fecha (y viceversa)
  const toggleAllDay = (value) => {
    setAllDay(value);
    setStart((current) => (value ? current.slice(0, 10) : `${current.slice(0, 10)}T08:00`));
    setEnd((current) => (value ? current.slice(0, 10) : `${current.slice(0, 10)}T09:00`));
  };

  const startDate = start ? new Date(allDay ? `${start}T00:00` : start) : null;
  const endDate = end ? new Date(allDay ? `${end}T23:59` : end) : null;
  const problems = [
    title.trim().length < 3 && 'El título debe tener al menos 3 caracteres.',
    (!startDate || Number.isNaN(startDate.getTime())) && 'Indica cuándo empieza.',
    (!endDate || Number.isNaN(endDate.getTime())) && 'Indica cuándo termina.',
    startDate && endDate && endDate < startDate && 'El fin debe ser posterior al inicio.',
  ].filter(Boolean);

  const save = () => {
    if (problems.length) return setShowProblems(true);
    const body = {
      title: title.trim(),
      category,
      allDay,
      startsAt: startDate.toISOString(),
      endsAt: endDate.toISOString(),
      location: location.trim() || null,
      description: description.trim() || null,
      sectionId: sectionId ? Number(sectionId) : null,
    };
    mutation.mutate(editing ? { eventId: event.id, ...body } : body, { onSuccess: onClose });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Editar evento' : 'Nuevo evento'}
      description="Se mostrará en el calendario de todo el colegio o de la sección que elijas."
      className="max-w-lg"
      footer={
        <>
          {showProblems && problems.length > 0 && (
            <p role="alert" className="mr-auto flex items-center gap-1.5 self-center text-xs text-red-600">
              <AlertCircle className="size-3.5 shrink-0" /> {problems[0]}
            </p>
          )}
          {editing && (
            <Button
              variant="ghost"
              className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700"
              loading={remove.isPending}
              onClick={() => window.confirm(`¿Eliminar «${event.title}» del calendario?`) && remove.mutate(event.id, { onSuccess: onClose })}
            >
              <Trash2 className="size-4" /> Eliminar
            </Button>
          )}
          <Button onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} loading={mutation.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form onSubmit={(formEvent) => formEvent.preventDefault()} className="space-y-4">
        <FormError error={mutation.error ?? remove.error} />
        <Field label="Título">
          {(id) => <input id={id} data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} className={inputClass} placeholder="Ej. Día del deporte" />}
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium text-zinc-700">Categoría</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Categoría">
            {Object.entries(CATEGORY_LOOK).map(([key, look]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={category === key}
                onClick={() => setCategory(key)}
                className={
                  category === key
                    ? 'inline-flex items-center gap-1.5 rounded-full border border-zinc-900 bg-zinc-900 px-3 py-1 text-xs font-medium text-white'
                    : 'inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100'
                }
              >
                <span className="size-2.5 rounded-full" style={{ backgroundColor: look.color }} /> {look.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} className="accent-brand-600" /> Todo el día
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Empieza">
            {(id) => <input id={id} type={allDay ? 'date' : 'datetime-local'} value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />}
          </Field>
          <Field label="Termina">
            {(id) => <input id={id} type={allDay ? 'date' : 'datetime-local'} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />}
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Para">
            {(id) => (
              <select id={id} value={sectionId} onChange={(e) => setSectionId(e.target.value)} className={inputClass}>
                <option value="">Todo el colegio</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    Solo {section.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Lugar" optional>
            {(id) => <input id={id} value={location} onChange={(e) => setLocation(e.target.value)} maxLength={150} className={inputClass} placeholder="Ej. Gimnasio" />}
          </Field>
        </div>

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
