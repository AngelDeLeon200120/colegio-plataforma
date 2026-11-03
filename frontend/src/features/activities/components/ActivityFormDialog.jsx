import { useId, useRef, useState } from 'react';
import { AlertCircle, FileText, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { formatBytes } from '@/lib/format';
import { ACCEPTED_EXTENSIONS, ACTIVITY_TYPES, MAX_FILES, MAX_FILE_BYTES } from '@/features/homework/model';
import { useCreateActivity, useUpdateActivity } from '../hooks';

const inputClass =
  'h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none disabled:bg-zinc-50';

/** ISO → valor de <input type="datetime-local"> en la hora del navegador. */
function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function defaultDue() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(23, 59, 0, 0);
  return toLocalInput(date.toISOString());
}

/**
 * Crear (con material de apoyo) o editar una actividad.
 * `activity` null = crear. En edición el curso, el tipo y el material no cambian.
 */
export function ActivityFormDialog({ activity, courses, defaultCourseId, onClose }) {
  const editing = Boolean(activity);
  const [selectedCourseId, setCourseId] = useState(String(activity?.course.id ?? defaultCourseId ?? courses[0]?.id ?? ''));
  // Si el diálogo se abrió antes de que cargaran los cursos, se toma el primero cuando llegan
  const courseId = selectedCourseId || String(courses[0]?.id ?? '');
  const [title, setTitle] = useState(activity?.title ?? '');
  const [type, setType] = useState(activity?.type ?? 'TASK');
  const [description, setDescription] = useState(activity?.description ?? '');
  const [dueAt, setDueAt] = useState(editing ? toLocalInput(activity.dueAt) : defaultDue());
  const [maxScore, setMaxScore] = useState(activity?.maxScore != null ? String(activity.maxScore) : '');
  const [allowLate, setAllowLate] = useState(activity?.allowLate ?? true);
  const [inGradebook, setInGradebook] = useState(false);
  const [gradeWeight, setGradeWeight] = useState('');
  const [files, setFiles] = useState([]);
  const [fileProblem, setFileProblem] = useState(null);
  const [showProblems, setShowProblems] = useState(false);
  const fileInput = useRef(null);
  const ids = { course: useId(), title: useId(), type: useId(), description: useId(), due: useId(), max: useId(), late: useId() };

  const create = useCreateActivity();
  const update = useUpdateActivity();
  const mutation = editing ? update : create;

  const maxScoreValue = maxScore.trim() === '' ? null : Number(maxScore.replace(',', '.'));
  const weightValue = Number(gradeWeight.replace(',', '.'));
  const gradebookValid = !inGradebook || (maxScoreValue > 0 && gradeWeight.trim() !== '' && weightValue >= 0 && weightValue <= 100);
  const problems = [
    !courseId && { field: ids.course, message: 'Elige un curso.' },
    title.trim().length < 3 && { field: ids.title, message: 'El título debe tener al menos 3 caracteres.' },
    !(maxScoreValue === null || maxScoreValue > 0) && { field: ids.max, message: 'Los puntos deben ser un número mayor que 0.' },
    !gradebookValid && {
      field: maxScoreValue > 0 ? `${ids.max}-weight` : ids.max,
      message: maxScoreValue > 0 ? 'El peso en la unidad debe estar entre 0 y 100 %.' : 'Para sumar al cuadro de notas, indica los puntos.',
    },
  ].filter(Boolean);
  const valid = problems.length === 0;
  const dueIso = dueAt ? new Date(dueAt).toISOString() : null;

  const addFiles = (list) => {
    const next = [...files];
    let problem = null;
    for (const file of list) {
      const extension = file.name.toLowerCase().split('.').pop();
      if (!ACCEPTED_EXTENSIONS.includes(extension)) problem = `${file.name}: formato no permitido`;
      else if (file.size > MAX_FILE_BYTES) problem = `${file.name}: supera ${formatBytes(MAX_FILE_BYTES)}`;
      else if (next.length >= MAX_FILES) problem = `Máximo ${MAX_FILES} archivos`;
      else next.push(file);
    }
    setFiles(next);
    setFileProblem(problem);
  };

  const save = async (publish) => {
    if (!valid) {
      // En vez de un botón apagado sin explicación, se dice qué falta y se lleva al campo
      setShowProblems(true);
      const field = document.getElementById(problems[0].field);
      field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      field?.focus({ preventScroll: true });
      return;
    }
    try {
      if (editing) {
        await update.mutateAsync({
          activityId: activity.id,
          title: title.trim(),
          description: description.trim() || null,
          dueAt: dueIso,
          allowLate,
          maxScore: maxScoreValue,
        });
      } else {
        await create.mutateAsync({
          courseId,
          title: title.trim(),
          type,
          description: description.trim(),
          dueAt: dueIso ?? undefined,
          maxScore: maxScoreValue ?? undefined,
          allowLate,
          publish,
          gradeWeight: inGradebook ? weightValue : undefined,
          files,
        });
      }
      onClose();
    } catch {
      // el error se muestra desde la mutación, arriba del formulario: se lleva a la vista
      requestAnimationFrame(() => document.getElementById(`${ids.title}-error`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
  };

  const problemNote = showProblems && !valid && (
    <p role="alert" className="mr-auto flex items-center gap-1.5 self-center text-xs text-red-600">
      <AlertCircle className="size-3.5 shrink-0" /> {problems[0].message}
    </p>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Editar actividad' : 'Nueva actividad'}
      description={editing ? activity.course.name : 'Solo la verán los estudiantes de la sección del curso.'}
      className="max-w-lg"
      footer={
        editing ? (
          <>
            <Button onClick={onClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            {problemNote}
            <Button variant="primary" onClick={() => save(false)} loading={mutation.isPending}>
              Guardar cambios
            </Button>
          </>
        ) : (
          <>
            {problemNote}
            <Button onClick={() => save(false)} disabled={mutation.isPending}>
              Guardar borrador
            </Button>
            <Button variant="primary" onClick={() => save(true)} loading={mutation.isPending}>
              Publicar
            </Button>
          </>
        )
      }
    >
      <form onSubmit={(event) => event.preventDefault()} className="space-y-4">
        {mutation.error && (
          <p id={`${ids.title}-error`} role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {mutation.error.message}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor={ids.course} className="block text-sm font-medium text-zinc-700">
              Curso
            </label>
            <select id={ids.course} value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={editing} className={inputClass}>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.type} className="block text-sm font-medium text-zinc-700">
              Tipo
            </label>
            <select id={ids.type} value={type} onChange={(e) => setType(e.target.value)} disabled={editing} className={inputClass}>
              {Object.entries(ACTIVITY_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ids.title} className="block text-sm font-medium text-zinc-700">
            Título
          </label>
          <input id={ids.title} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="ej. Guía de fracciones" data-autofocus className={inputClass} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ids.description} className="block text-sm font-medium text-zinc-700">
            Instrucciones
          </label>
          <textarea
            id={ids.description}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Qué deben hacer y cómo entregarlo"
            className="block w-full resize-y rounded-md border border-zinc-200 px-3 py-2 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor={ids.due} className="block text-sm font-medium text-zinc-700">
              Fecha de entrega
            </label>
            <input id={ids.due} type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.max} className="block text-sm font-medium text-zinc-700">
              Puntos <span className="font-normal text-zinc-400">(opcional)</span>
            </label>
            <input id={ids.max} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} inputMode="decimal" placeholder="ej. 20" className={inputClass} />
          </div>
        </div>

        <label htmlFor={ids.late} className="flex items-start gap-2.5 text-sm">
          <input id={ids.late} type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} className="mt-0.5 size-4 accent-zinc-900" />
          <span>
            <span className="font-medium text-zinc-900">Aceptar entregas tardías</span>
            <span className="block text-zinc-500">Quedan marcadas como tardías. Si no, al vencer se avisa una sola vez que no se entregó.</span>
          </span>
        </label>

        {!editing && (
          <div className="rounded-lg border border-zinc-200 p-3">
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={inGradebook} onChange={(e) => setInGradebook(e.target.checked)} className="mt-0.5 size-4 accent-zinc-900" />
              <span>
                <span className="font-medium text-zinc-900">Sumar al cuadro de notas</span>
                <span className="block text-zinc-500">Crea su columna en la unidad; al aprobar una entrega con nota, se copia sola.</span>
              </span>
            </label>
            {inGradebook && (
              <div className="mt-3 flex items-center gap-2 pl-6.5 text-sm">
                <label htmlFor={`${ids.max}-weight`} className="text-zinc-700">
                  Peso en la unidad
                </label>
                <input
                  id={`${ids.max}-weight`}
                  value={gradeWeight}
                  onChange={(e) => setGradeWeight(e.target.value)}
                  inputMode="decimal"
                  placeholder="ej. 10"
                  className={`${inputClass} w-20`}
                />
                <span className="text-zinc-500">%</span>
                {!(maxScoreValue > 0) && <span className="text-xs text-amber-700">Indica los puntos de la actividad.</span>}
              </div>
            )}
          </div>
        )}

        {!editing && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-zinc-700">
              Material de apoyo <span className="font-normal text-zinc-400">(opcional)</span>
            </p>
            {files.length > 0 && (
              <ul className="mb-2 space-y-1">
                {files.map((file) => (
                  <li key={`${file.name}-${file.size}`} className="flex items-center gap-2 rounded-md bg-zinc-50 px-2.5 py-1.5 text-sm ring-1 ring-zinc-200">
                    <FileText className="size-4 shrink-0 text-zinc-400" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-zinc-400">{formatBytes(file.size)}</span>
                    <button type="button" onClick={() => setFiles(files.filter((f) => f !== file))} aria-label={`Quitar ${file.name}`} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200">
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Button size="sm" onClick={() => fileInput.current?.click()} disabled={files.length >= MAX_FILES}>
              <Paperclip className="size-3.5" /> Adjuntar archivo
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            {fileProblem && <p className="mt-1 text-xs text-amber-700">{fileProblem}</p>}
          </div>
        )}
      </form>
    </Dialog>
  );
}
