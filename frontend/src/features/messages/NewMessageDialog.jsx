import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, inputClass } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { useCreateThread, useRecipients } from './hooks';
import { REASONS, TASKS_LOOK } from './model';

const chipClass = (active) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
    active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100',
  );

/**
 * Mensaje nuevo. Familia y estudiante escriben sobre su estudiante; el personal, sobre un
 * estudiante o a toda una sección. El asunto es Tareas o Ausencia (con su motivo).
 */
export function NewMessageDialog({ onClose, onCreated }) {
  const recipients = useRecipients(true);
  const create = useCreateThread();
  const options = recipients.data;

  const [scope, setScope] = useState('STUDENT');
  const [sectionId, setSectionId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [topic, setTopic] = useState('TAREAS');
  const [reason, setReason] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showProblems, setShowProblems] = useState(false);

  const staff = Boolean(options?.canMessageSection);
  const sections = options?.sections ?? [];
  const students = options?.students ?? [];
  // El personal elige primero la sección; la familia ve directamente a sus estudiantes
  const effectiveSectionId = sectionId || String(sections[0]?.id ?? '');
  const visibleStudents = staff ? students.filter((student) => String(student.sectionId) === effectiveSectionId) : students;
  const effectiveStudentId = studentId || (visibleStudents.length === 1 ? String(visibleStudents[0].id) : '');

  const look = topic === 'AUSENCIA' && reason ? REASONS[reason] : TASKS_LOOK;
  const problems = [
    scope === 'STUDENT' && !effectiveStudentId && 'Elige el estudiante.',
    scope === 'SECTION' && !effectiveSectionId && 'Elige la sección.',
    topic === 'AUSENCIA' && !reason && 'Elige el motivo de la ausencia.',
    subject.trim().length < 3 && 'El asunto debe tener al menos 3 caracteres.',
    !body.trim() && 'Escribe el mensaje.',
  ].filter(Boolean);

  const send = () => {
    if (problems.length) return setShowProblems(true);
    create.mutate(
      {
        scope,
        topic,
        subject: subject.trim(),
        body: body.trim(),
        ...(topic === 'AUSENCIA' && { reason }),
        ...(scope === 'STUDENT' ? { studentId: Number(effectiveStudentId) } : { sectionId: Number(effectiveSectionId) }),
      },
      { onSuccess: (data) => onCreated(data.thread.id) },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nuevo mensaje"
      description={
        scope === 'SECTION'
          ? 'Lo recibirán todos los estudiantes y familias de la sección. Solo el personal puede responder.'
          : 'Lo verán el estudiante, su familia, los docentes de su sección y la administración.'
      }
      className="max-w-lg"
      footer={
        <>
          {showProblems && problems.length > 0 && (
            <p role="alert" className="mr-auto flex items-center gap-1.5 self-center text-xs text-red-600">
              <AlertCircle className="size-3.5 shrink-0" /> {problems[0]}
            </p>
          )}
          <Button onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={send} loading={create.isPending}>
            Enviar
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => event.preventDefault()} className="space-y-4">
        <FormError error={create.error ?? recipients.error} />

        {staff && (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Para quién">
            <button type="button" role="radio" aria-checked={scope === 'STUDENT'} className={chipClass(scope === 'STUDENT')} onClick={() => setScope('STUDENT')}>
              Sobre un estudiante
            </button>
            <button type="button" role="radio" aria-checked={scope === 'SECTION'} className={chipClass(scope === 'SECTION')} onClick={() => setScope('SECTION')}>
              Aviso a toda la sección
            </button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {staff && (
            <Field label="Sección" className={scope === 'SECTION' ? 'sm:col-span-2' : undefined}>
              {(id) => (
                <select
                  id={id}
                  value={effectiveSectionId}
                  onChange={(event) => {
                    setSectionId(event.target.value);
                    setStudentId('');
                  }}
                  className={inputClass}
                >
                  {sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          {scope === 'STUDENT' && (
            <Field label="Estudiante" className={staff ? undefined : 'sm:col-span-2'}>
              {(id) => (
                <select
                  id={id}
                  value={effectiveStudentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  disabled={recipients.isLoading || (!staff && students.length === 1)}
                  className={inputClass}
                >
                  {visibleStudents.length !== 1 && <option value="">{recipients.isLoading ? 'Cargando…' : 'Elige un estudiante'}</option>}
                  {visibleStudents.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.firstName} {student.lastName}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-zinc-700">Asunto</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Asunto">
            <button type="button" role="radio" aria-checked={topic === 'TAREAS'} className={chipClass(topic === 'TAREAS')} onClick={() => setTopic('TAREAS')}>
              <TASKS_LOOK.icon className="size-3.5" /> Tareas
            </button>
            <button type="button" role="radio" aria-checked={topic === 'AUSENCIA'} className={chipClass(topic === 'AUSENCIA')} onClick={() => setTopic('AUSENCIA')}>
              Ausencia
            </button>
          </div>
          {topic === 'AUSENCIA' && (
            <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg bg-zinc-50 p-2" role="radiogroup" aria-label="Motivo de la ausencia">
              {Object.entries(REASONS).map(([key, item]) => (
                <button key={key} type="button" role="radio" aria-checked={reason === key} className={chipClass(reason === key)} onClick={() => setReason(key)}>
                  <item.icon className="size-3.5" style={{ color: reason === key ? undefined : item.color }} /> {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Field label="Título">
          {(id) => <input id={id} value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} placeholder={look.placeholder} className={inputClass} />}
        </Field>

        <Field label="Mensaje">
          {(id) => (
            <textarea
              id={id}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Escribe aquí los detalles"
              className="block w-full resize-y rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
