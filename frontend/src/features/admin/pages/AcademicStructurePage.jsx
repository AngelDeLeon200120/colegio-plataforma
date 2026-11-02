import { useState } from 'react';
import { AlertTriangle, Lock, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, FormError, inputClass } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate } from '@/lib/format';
import { adminApi } from '../api';
import { useAcademicStructure, useAdminMutation } from '../hooks';

const UNIT_STATUS = {
  SCHEDULED: { label: 'Programada', tone: 'neutral' },
  ACTIVE: { label: 'Activa', tone: 'green' },
  CLOSED: { label: 'Cerrada', tone: 'neutral' },
};

function Card({ title, description, action, children }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-xs">
      <header className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/**
 * Formulario pequeño en diálogo. `fields`: [{ key, label, type?, options?, optional?, placeholder? }].
 * `toBody` convierte los valores en el cuerpo de la petición.
 */
function QuickCreateDialog({ title, fields, submitLabel, mutationFn, toBody, onClose }) {
  const [values, setValues] = useState(Object.fromEntries(fields.map((field) => [field.key, field.initial ?? ''])));
  const save = useAdminMutation(mutationFn);
  const valid = fields.every((field) => field.optional || String(values[field.key]).trim());

  const submit = async (event) => {
    event.preventDefault();
    if (!valid) return;
    try {
      await save.mutateAsync(toBody(values));
      onClose();
    } catch {
      // se muestra en el formulario
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="quick-form" variant="primary" loading={save.isPending} disabled={!valid}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id="quick-form" onSubmit={submit} className="space-y-4">
        <FormError error={save.error} />
        {fields.map((field, index) => (
          <Field key={field.key} label={field.label} optional={field.optional} hint={field.hint}>
            {(id) =>
              field.options ? (
                <select id={id} value={values[field.key]} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} className={inputClass}>
                  {field.optional && <option value="">—</option>}
                  {!field.optional && <option value="">Elegir…</option>}
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  type={field.type ?? 'text'}
                  value={values[field.key]}
                  placeholder={field.placeholder}
                  onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                  data-autofocus={index === 0 || undefined}
                  className={inputClass}
                />
              )
            }
          </Field>
        ))}
      </form>
    </Dialog>
  );
}

function UnitActions({ unit }) {
  const action = useAdminMutation(({ id, name }) => adminApi.unitAction(id, name));
  const [confirm, setConfirm] = useState(false);
  const available = { SCHEDULED: ['activate', 'Activar'], ACTIVE: ['close', 'Cerrar'], CLOSED: ['reopen', 'Reabrir'] }[unit.status];

  const run = () => {
    // Cerrar congela notas y oculta entregas: pide confirmación
    if (available[0] === 'close' && !confirm) return setConfirm(true);
    action.mutate({ id: unit.id, name: available[0] }, { onSettled: () => setConfirm(false) });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant={confirm ? 'warning' : 'secondary'} loading={action.isPending} onClick={run}>
        {confirm ? '¿Cerrar? Las notas quedan de solo lectura' : available[1]}
      </Button>
      {action.error && <span className="max-w-64 text-right text-xs text-red-600">{action.error.message}</span>}
    </div>
  );
}

function CourseTeacher({ course, teachers }) {
  const update = useAdminMutation(({ id, teacherId }) => adminApi.updateCourse(id, { teacherId }));
  return (
    <div>
      <select
        value={course.teacherId}
        onChange={(event) => update.mutate({ id: course.id, teacherId: Number(event.target.value) })}
        aria-label={`Docente de ${course.label}`}
        disabled={update.isPending}
        className={`${inputClass} h-8`}
      >
        {!teachers.some((t) => t.id === course.teacherId) && <option value={course.teacherId}>{course.teacher}</option>}
        {teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.name}
          </option>
        ))}
      </select>
      {update.error && <p className="mt-1 text-xs text-red-600">{update.error.message}</p>}
    </div>
  );
}

export function AcademicStructurePage() {
  const { data, isLoading, isError, error } = useAcademicStructure();
  const [dialog, setDialog] = useState(null);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (isError) return <p className="p-6 text-sm text-red-600">{error.message}</p>;
  if (!data.year) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-zinc-600">
        <AlertTriangle className="size-4 text-amber-500" /> No hay un ciclo lectivo activo.
      </p>
    );
  }

  const teacherOptions = data.teachers.map((teacher) => ({ value: teacher.id, label: teacher.name }));
  const sectionOptions = data.sections.map((section) => ({ value: section.id, label: section.label }));
  const subjectOptions = data.subjects.map((subject) => ({ value: subject.id, label: subject.name }));
  const gradeOptions = data.gradeLevels.map((grade) => ({ value: grade.id, label: grade.name }));

  const dialogs = {
    unit: {
      title: 'Nueva unidad',
      submitLabel: 'Crear unidad',
      mutationFn: adminApi.createUnit,
      fields: [
        { key: 'name', label: 'Nombre', placeholder: `ej. Unidad ${['I', 'II', 'III', 'IV', 'V', 'VI'][data.units.length] ?? ''}` },
        { key: 'startsOn', label: 'Inicia', type: 'date' },
        { key: 'endsOn', label: 'Termina', type: 'date' },
      ],
      toBody: (v) => ({ name: v.name.trim(), startsOn: v.startsOn, endsOn: v.endsOn }),
    },
    grade: {
      title: 'Nuevo grado',
      submitLabel: 'Crear grado',
      mutationFn: adminApi.createGradeLevel,
      fields: [
        { key: 'name', label: 'Nombre', placeholder: 'ej. Cuarto Primaria' },
        { key: 'shortName', label: 'Abreviatura', placeholder: 'ej. 4to' },
        { key: 'educationLevel', label: 'Nivel', placeholder: 'ej. Primaria', optional: true },
      ],
      toBody: (v) => ({ name: v.name.trim(), shortName: v.shortName.trim(), educationLevel: v.educationLevel.trim() || undefined }),
    },
    section: {
      title: 'Nueva sección',
      submitLabel: 'Crear sección',
      mutationFn: adminApi.createSection,
      fields: [
        { key: 'gradeLevelId', label: 'Grado', options: gradeOptions },
        { key: 'name', label: 'Sección', placeholder: 'ej. A' },
        { key: 'homeroomTeacherId', label: 'Docente guía', options: teacherOptions, optional: true },
      ],
      toBody: (v) => ({ gradeLevelId: Number(v.gradeLevelId), name: v.name.trim(), homeroomTeacherId: v.homeroomTeacherId ? Number(v.homeroomTeacherId) : undefined }),
    },
    subject: {
      title: 'Nueva materia',
      submitLabel: 'Crear materia',
      mutationFn: adminApi.createSubject,
      fields: [
        { key: 'name', label: 'Nombre', placeholder: 'ej. Ciencias Naturales' },
        { key: 'code', label: 'Código', placeholder: 'ej. CCNN' },
        { key: 'color', label: 'Color', type: 'color', initial: '#16a34a' },
      ],
      toBody: (v) => ({ name: v.name.trim(), code: v.code.trim(), color: v.color }),
    },
    course: {
      title: 'Nuevo curso',
      submitLabel: 'Asignar',
      mutationFn: adminApi.createCourse,
      fields: [
        { key: 'sectionId', label: 'Sección', options: sectionOptions },
        { key: 'subjectId', label: 'Materia', options: subjectOptions },
        { key: 'teacherId', label: 'Docente', options: teacherOptions },
      ],
      toBody: (v) => ({ sectionId: Number(v.sectionId), subjectId: Number(v.subjectId), teacherId: Number(v.teacherId) }),
    },
  };

  const addButton = (kind, label) => (
    <Button size="sm" onClick={() => setDialog(kind)}>
      <Plus className="size-3.5" /> {label}
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 overflow-y-auto px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Estructura académica</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Ciclo {data.year.name} · {formatDate(data.year.startsOn)} al {formatDate(data.year.endsOn)}
        </p>
      </header>

      <Card
        title="Unidades"
        description="Solo una unidad activa a la vez. Las programadas no se ven para estudiantes ni familias; al cerrar una unidad sus notas quedan de solo lectura."
        action={addButton('unit', 'Unidad')}
      >
        <ul className="divide-y divide-zinc-100">
          {data.units.map((unit) => (
            <li key={unit.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                  {unit.status === 'CLOSED' && <Lock className="size-3.5 text-zinc-400" />}
                  {unit.name}
                  <Badge tone={UNIT_STATUS[unit.status].tone} dot={unit.status === 'ACTIVE'}>
                    {UNIT_STATUS[unit.status].label}
                  </Badge>
                </p>
                <p className="text-xs text-zinc-500">
                  {formatDate(unit.startsOn)} al {formatDate(unit.endsOn)}
                </p>
              </div>
              <UnitActions unit={unit} />
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Grados y secciones" action={<div className="flex gap-1.5">{addButton('grade', 'Grado')}{addButton('section', 'Sección')}</div>}>
          <ul className="divide-y divide-zinc-100">
            {data.sections.length === 0 && <li className="px-4 py-6 text-center text-sm text-zinc-500">Sin secciones en el ciclo.</li>}
            {data.sections.map((section) => (
              <li key={section.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{section.label}</span>
                  {section.homeroomTeacher && <span className="text-zinc-500"> · guía: {section.homeroomTeacher}</span>}
                </span>
                <span className="text-xs text-zinc-500 tabular-nums">{section.studentCount} estudiantes</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Materias" action={addButton('subject', 'Materia')}>
          <ul className="divide-y divide-zinc-100">
            {data.subjects.map((subject) => (
              <li key={subject.id} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
                <span className="size-3 rounded-full" style={{ backgroundColor: subject.color ?? '#a1a1aa' }} aria-hidden />
                <span className="flex-1 font-medium">{subject.name}</span>
                <span className="font-mono text-xs text-zinc-500">{subject.code}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Cursos" description="Un curso es una materia en una sección, con su docente. Cambiar el docente le pasa sus actividades y su cuadro de notas." action={addButton('course', 'Curso')}>
        <ul className="divide-y divide-zinc-100">
          {data.courses.length === 0 && <li className="px-4 py-6 text-center text-sm text-zinc-500">Sin cursos asignados.</li>}
          {data.courses.map((course) => (
            <li key={course.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="min-w-48 flex-1 text-sm font-medium">{course.label}</span>
              <div className="w-56">
                <CourseTeacher course={course} teachers={data.teachers} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {dialog && <QuickCreateDialog {...dialogs[dialog]} onClose={() => setDialog(null)} />}
    </div>
  );
}
