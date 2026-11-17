import { useState } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, inputClass } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { useConductStudents, useCreateReport } from './hooks';
import { CATEGORIES } from './model';

const todayInput = () => new Date().toLocaleDateString('en-CA');

/** Nuevo reporte de conducta. La familia lo recibe como notificación. */
export function NewReportDialog({ defaultStudentId, onClose, onCreated }) {
  const { data, isLoading } = useConductStudents({});
  const create = useCreateReport();
  const students = data?.students ?? [];
  const threshold = data?.threshold ?? 3;
  const sections = [...new Map(students.map((student) => [student.section.id, student.section])).values()];

  const initial = students.find((student) => String(student.id) === String(defaultStudentId));
  const [sectionId, setSectionId] = useState('');
  const [studentId, setStudentId] = useState(defaultStudentId ? String(defaultStudentId) : '');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [incidentDate, setIncidentDate] = useState(todayInput());
  const [showProblems, setShowProblems] = useState(false);

  const effectiveSection = sectionId || String(initial?.section.id ?? sections[0]?.id ?? '');
  const visible = students.filter((student) => String(student.section.id) === effectiveSection);
  const selected = students.find((student) => String(student.id) === studentId);
  const nextCount = selected ? selected.reportCount + 1 : null;

  const problems = [
    !selected && 'Elige el estudiante.',
    !category && 'Elige el tipo de reporte.',
    description.trim().length < 5 && 'Escribe qué fue lo que pasó.',
    !incidentDate && 'Indica la fecha.',
  ].filter(Boolean);

  const save = () => {
    if (problems.length) return setShowProblems(true);
    create.mutate(
      { studentId: Number(studentId), category, description: description.trim(), incidentDate },
      { onSuccess: (result) => (onCreated ? onCreated(result, selected) : onClose()) },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nuevo reporte de conducta"
      description="La familia del estudiante recibirá el reporte como notificación."
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
          <Button variant="primary" onClick={save} loading={create.isPending}>
            Enviar reporte
          </Button>
        </>
      }
    >
      <form onSubmit={(event) => event.preventDefault()} className="space-y-4">
        <FormError error={create.error} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sección">
            {(id) => (
              <select
                id={id}
                value={effectiveSection}
                onChange={(event) => {
                  setSectionId(event.target.value);
                  setStudentId('');
                }}
                disabled={isLoading}
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
          <Field label="Estudiante">
            {(id) => (
              <select id={id} value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={isLoading} className={inputClass}>
                <option value="">{isLoading ? 'Cargando…' : 'Elige un estudiante'}</option>
                {visible.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.lastName}, {student.firstName} {student.reportCount > 0 ? `· ${student.reportCount} reporte${student.reportCount === 1 ? '' : 's'}` : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        {selected && nextCount % threshold === 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-red-100">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Con este serán {nextCount} reportes: se abrirá un seguimiento y la administración decidirá si se cita a la familia o al tutor.
          </p>
        )}

        <div>
          <p className="mb-1.5 text-sm font-medium text-zinc-700">Tipo de reporte</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de reporte">
            {Object.entries(CATEGORIES).map(([key, item]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={category === key}
                onClick={() => setCategory(key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  category === key ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100',
                )}
              >
                <item.icon className="size-3.5" style={{ color: category === key ? undefined : item.color }} /> {item.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="¿Qué fue lo que pasó?">
          {(id) => (
            <textarea
              id={id}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Describe lo ocurrido de forma objetiva: qué pasó, en qué clase y a qué hora"
              className="block w-full resize-y rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
            />
          )}
        </Field>

        <Field label="Fecha">
          {(id) => <input id={id} type="date" value={incidentDate} max={todayInput()} onChange={(event) => setIncidentDate(event.target.value)} className={inputClass} />}
        </Field>
      </form>
    </Dialog>
  );
}
