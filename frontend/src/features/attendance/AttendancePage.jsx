import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useSearchParams } from 'react-router';
import { AlertTriangle, CalendarPlus, CheckCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormError } from '@/components/ui/Field';
import { Kbd } from '@/components/ui/Kbd';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMyCourses } from '@/features/gradebook/hooks';
import { cn } from '@/lib/cn';
import { formatDate, formatScore } from '@/lib/format';
import { useAttendanceSheet, useRemoveAttendance, useSaveAttendance } from './hooks';
import { ABSENT, PRESENT, cellKey, changedDates, effectiveStatus, statusOf, summarize, toDays } from './model';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const longDate = (date) => formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
const inputClass = 'h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm shadow-xs focus:ring-2 focus:ring-zinc-200 focus:outline-none';

// Bordes de hoja de cálculo
const CELL = 'border-r border-b border-zinc-400';
// Encabezado fijo arriba (el contenedor tiene relleno: de ahí el negativo)
const HEAD = 'sticky -top-4 z-20 sm:-top-6';

function RemoveDayDialog({ date, courseId, onClose, onRemoved }) {
  const remove = useRemoveAttendance(courseId);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Quitar la lista de este día"
      description={longDate(date)}
      footer={
        <>
          <Button onClick={onClose} disabled={remove.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" className="bg-red-600 hover:bg-red-700" loading={remove.isPending} onClick={() => remove.mutate(date, { onSuccess: onRemoved })}>
            Quitar
          </Button>
        </>
      }
    >
      <FormError error={remove.error} />
      <p className="text-sm text-zinc-700">Se borra la asistencia de ese día y se recalcula la nota de Asistencia. Úsalo si fue asueto o se pasó lista por error.</p>
    </Dialog>
  );
}

/** Hoja de asistencia: una fila por estudiante y una columna por día con su check (vino) o equis (faltó). */
function AttendanceSheet({ sheet, courseId }) {
  const [changes, setChanges] = useState({}); // "fecha:estudiante" → estado sin guardar
  const [extraDates, setExtraDates] = useState([]);
  const [active, setActive] = useState({ row: 0, date: sheet.today });
  const [notice, setNotice] = useState(null);
  const [removing, setRemoving] = useState(false);
  const save = useSaveAttendance(courseId);
  const gridRef = useRef(null);

  const { students } = sheet;
  // Hoy siempre está en la hoja, aunque todavía no se haya pasado lista
  const dates = useMemo(() => [...new Set([...Object.keys(sheet.days), ...extraDates, sheet.today])].sort(), [sheet.days, sheet.today, extraDates]);
  const touched = changedDates(changes);
  const dirty = touched.size > 0;
  const activeDate = dates.includes(active.date) ? active.date : sheet.today;
  const activeRow = clamp(active.row, 0, students.length - 1);
  const activeSaved = Boolean(sheet.days[activeDate]);

  // Al abrir y al agregar un día, la columna activa queda a la vista
  useEffect(() => {
    gridRef.current?.querySelector(`[data-cell="${activeRow}:${activeDate}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeRow, activeDate]);

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Salir a otra sección o cambiar de curso con marcas sin guardar pide confirmación
  const blocker = useBlocker(dirty);

  const setStatus = (date, studentId, status) => {
    setNotice(null);
    setChanges((current) => {
      const next = { ...current, [cellKey(date, studentId)]: status };
      // Volver a lo guardado (o quitar el check de un día nuevo) no es un cambio
      if ((sheet.days[date]?.[studentId] ?? (sheet.days[date] ? null : ABSENT)) === status) delete next[cellKey(date, studentId)];
      return next;
    });
  };
  const togglePresent = (date, studentId) => setStatus(date, studentId, statusOf(sheet, changes, date, studentId) === PRESENT ? ABSENT : PRESENT);
  const markAll = () => students.forEach((student) => setStatus(activeDate, student.id, PRESENT));

  const addDate = (date) => {
    if (!date || date > sheet.today || date < sheet.unit.startsOn) return;
    setExtraDates((current) => (current.includes(date) ? current : [...current, date]));
    setActive({ row: 0, date });
  };

  const onSave = () =>
    save.mutate(toDays(sheet, changes), {
      onSuccess: () => {
        setChanges({});
        setNotice('Guardado. La nota ya está en el cuadro.');
      },
    });

  const onKeyDown = (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const col = dates.indexOf(activeDate);
    const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [1, 0] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setActive({ row: clamp(activeRow + move[0], 0, students.length - 1), date: dates[clamp(col + move[1], 0, dates.length - 1)] });
    } else if (event.key === ' ' || event.key.toLowerCase() === 'x') {
      event.preventDefault();
      togglePresent(activeDate, students[activeRow].id);
    }
  };

  const onCell = (row, date) => {
    setActive({ row, date });
    togglePresent(date, students[row].id);
    gridRef.current?.focus({ preventScroll: true });
  };

  if (!students.length) return <p className="py-10 text-center text-sm text-zinc-500">No hay estudiantes inscritos en esta sección.</p>;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 sm:px-6">
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <CalendarPlus className="size-4" /> Agregar día
          <input
            type="date"
            value=""
            min={sheet.unit.startsOn}
            max={sheet.today}
            onChange={(event) => addDate(event.target.value)}
            aria-label="Agregar día"
            className={inputClass}
          />
        </label>
        <span className="text-sm font-medium text-zinc-900 first-letter:uppercase">{longDate(activeDate)}</span>
        <Button size="sm" onClick={markAll}>
          <CheckCheck className="size-4" /> Todos vinieron
        </Button>
        {activeSaved && (
          <Button size="sm" variant="ghost" onClick={() => setRemoving(true)} disabled={save.isPending || dirty} title={dirty ? 'Guarda primero los cambios' : undefined}>
            <Trash2 className="size-3.5" /> Quitar día
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3">
          {save.error ? (
            <span role="alert" className="text-sm text-red-600">
              {save.error.message}
            </span>
          ) : dirty ? (
            <span className="text-sm font-medium text-amber-700">Cambios sin guardar</span>
          ) : (
            <span className="text-sm text-emerald-700" aria-live="polite">
              {notice}
            </span>
          )}
          <Button variant="primary" onClick={onSave} loading={save.isPending} disabled={!dirty}>
            Guardar asistencia
          </Button>
        </div>
      </div>

      <div
        ref={gridRef}
        tabIndex={0}
        role="grid"
        aria-label="Hoja de asistencia"
        onKeyDown={onKeyDown}
        className="min-h-0 flex-1 overflow-auto bg-white p-4 focus:outline-none sm:p-6 [scroll-padding-left:22rem] max-sm:[scroll-padding-left:13rem]"
      >
        <h2 className="sticky left-0 mb-3 text-center text-sm font-bold text-zinc-900 uppercase">
          {sheet.course.name} · {sheet.unit.name}
        </h2>
        <table className="border-separate border-spacing-0 border-t border-l border-zinc-400 text-sm">
          <thead>
            <tr>
              <th className={cn(CELL, 'sticky -top-4 -left-4 z-30 w-11 min-w-11 bg-white px-1 py-1.5 text-center text-xs font-bold sm:-top-6 sm:-left-6')}>No.</th>
              <th className={cn(CELL, 'sticky -top-4 left-7 z-30 w-64 min-w-64 bg-white px-2 text-center text-xs font-bold max-sm:w-36 max-sm:min-w-36 sm:-top-6 sm:left-5')}>NOMBRE</th>
              {dates.map((date) => (
                <DayHeader key={date} date={date} today={sheet.today} active={date === activeDate} changed={touched.has(date)} onSelect={() => setActive({ row: activeRow, date })} />
              ))}
              <th className={cn(CELL, HEAD, 'min-w-16 bg-white px-2 text-center text-xs font-bold')}>Vino</th>
              <th className={cn(CELL, HEAD, 'min-w-14 bg-white px-2 text-center text-xs font-bold')}>%</th>
              <th className={cn(CELL, HEAD, 'min-w-20 bg-white px-2 text-center text-xs font-bold')}>
                Nota<span className="block text-[10px] font-normal text-zinc-500">/{formatScore(sheet.maxScore)}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {students.map((student, row) => {
              const summary = summarize(sheet, changes, dates, student.id);
              const good = summary.rate !== null && summary.rate >= sheet.goodAttendance;
              const rowActive = row === activeRow;
              return (
                <tr key={student.id}>
                  <td className={cn(CELL, 'sticky -left-4 z-10 bg-white text-center text-xs tabular-nums sm:-left-6', rowActive && 'bg-brand-50')}>{row + 1}</td>
                  <th
                    scope="row"
                    title={student.code}
                    className={cn(CELL, 'sticky left-7 z-10 max-w-64 truncate bg-white px-2 text-left font-normal text-zinc-900 max-sm:max-w-36 sm:left-5', rowActive && 'bg-brand-50')}
                  >
                    {student.lastName}, {student.firstName}
                  </th>
                  {dates.map((date) => {
                    const status = effectiveStatus(sheet, changes, touched, date, student.id);
                    const isActive = rowActive && date === activeDate;
                    const name = `${student.firstName} ${student.lastName}`;
                    return (
                      <DayCell
                        key={date}
                        id={`${row}:${date}`}
                        status={status}
                        active={isActive}
                        changed={cellKey(date, student.id) in changes}
                        label={`${name}, ${formatDate(date, { day: 'numeric', month: 'long' })}`}
                        onClick={() => onCell(row, date)}
                      />
                    );
                  })}
                  <td className={cn(CELL, 'px-2 text-center tabular-nums')}>{summary.counted ? `${summary.present}/${summary.counted}` : ''}</td>
                  <td className={cn(CELL, 'px-2 text-center tabular-nums')}>{summary.rate === null ? '' : `${formatScore(Math.round(summary.rate * 100))}%`}</td>
                  <td
                    className={cn(CELL, 'px-2 text-center font-semibold tabular-nums', summary.adjusted ? 'text-blue-700' : good ? 'text-emerald-700' : 'text-red-600')}
                    title={summary.adjusted ? 'Cambiada con "Mejora" en el cuadro de notas' : undefined}
                  >
                    {summary.score === null ? '' : formatScore(summary.score)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className={cn(CELL, 'sticky -left-4 z-10 bg-zinc-100 sm:-left-6')} />
              <th scope="row" className={cn(CELL, 'sticky left-7 z-10 bg-zinc-100 px-2 py-1 text-right text-xs font-semibold text-zinc-600 sm:left-5')}>
                Vinieron
              </th>
              {dates.map((date) => {
                const count = students.filter((student) => effectiveStatus(sheet, changes, touched, date, student.id) === PRESENT).length;
                return (
                  <td key={date} className={cn(CELL, 'bg-zinc-100 text-center text-xs font-semibold tabular-nums')}>
                    {sheet.days[date] || touched.has(date) ? count : ''}
                  </td>
                );
              })}
              <td className={cn(CELL, 'bg-zinc-100')} colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-200 bg-white px-4 py-1.5 text-[11px] text-zinc-500 sm:px-6">
        <span className="flex items-center gap-1">
          <span className="font-bold text-emerald-700">✓</span> vino
        </span>
        <span className="flex items-center gap-1">
          <span className="font-bold text-red-600">✗</span> faltó
        </span>
        <span className="max-lg:hidden">
          Flechas para moverte · <Kbd>Espacio</Kbd> marcar
        </span>
        <span className="ml-auto">
          {Math.round(sheet.goodAttendance * 100)}% o más = {formatScore(sheet.maxScore)} puntos
        </span>
      </footer>

      {removing && (
        <RemoveDayDialog
          date={activeDate}
          courseId={courseId}
          onClose={() => setRemoving(false)}
          onRemoved={() => {
            setExtraDates((current) => current.filter((date) => date !== activeDate));
            setNotice(null);
            setRemoving(false);
          }}
        />
      )}
      {blocker.state === 'blocked' && (
        <Dialog
          open
          onClose={() => blocker.reset()}
          title="Hay asistencia sin guardar"
          footer={
            <>
              <Button onClick={() => blocker.reset()}>Seguir aquí</Button>
              <Button variant="warning" onClick={() => blocker.proceed()}>
                Salir sin guardar
              </Button>
            </>
          }
        >
          <p className="text-sm text-zinc-700">Las marcas que hiciste se perderán.</p>
        </Dialog>
      )}
    </>
  );
}

function DayHeader({ date, today, active, changed, onSelect }) {
  return (
    <th className={cn(CELL, HEAD, 'w-16 min-w-16 p-0 text-center', active ? 'bg-brand-100' : 'bg-white')}>
      <button type="button" onClick={onSelect} className="w-full px-1 py-1 hover:bg-brand-50" title={longDate(date)}>
        <span className="block text-xs font-bold text-zinc-900">{formatDate(date, { day: 'numeric', month: 'short' })}</span>
        <span className={cn('block text-[10px] font-normal', date === today ? 'text-brand-700' : 'text-zinc-500')}>
          {date === today ? 'hoy' : formatDate(date, { weekday: 'short' })}
          {changed && ' •'}
        </span>
      </button>
    </th>
  );
}

const MARKS = {
  [PRESENT]: { text: '✓', label: 'vino', className: 'text-emerald-700' },
  [ABSENT]: { text: '✗', label: 'faltó', className: 'text-red-600' },
};

function DayCell({ id, status, active, changed, label, onClick }) {
  const mark = MARKS[status];
  return (
    <td
      data-cell={id}
      role="gridcell"
      onClick={onClick}
      aria-label={`${label}: ${mark?.label ?? 'sin marcar'}`}
      className={cn(
        CELL,
        'h-8 cursor-pointer text-center text-base font-bold select-none hover:bg-emerald-50',
        mark?.className,
        changed && 'bg-amber-50',
        active && 'shadow-[inset_0_0_0_2px_var(--color-blue-500)]',
      )}
    >
      {mark?.text}
    </td>
  );
}

/** Asistencias: el docente pasa lista en una hoja; la nota va sola a la columna Asistencia del cuadro. */
export function AttendancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: courses, isLoading: loadingCourses, isError: coursesFailed, error: coursesError } = useMyCourses();
  const requested = searchParams.get('course');
  const course = courses?.find((item) => String(item.id) === requested) ?? courses?.[0];
  const { data: sheet, isLoading, isError, error } = useAttendanceSheet(course?.id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="text-2xl font-normal text-zinc-900">Asistencias</h1>
        {course && (
          <>
            <select value={course.id} onChange={(event) => setSearchParams({ course: event.target.value })} aria-label="Curso" className={cn(inputClass, 'max-w-full')}>
              {courses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <Link to={`/courses/${course.id}/gradebook`} className="ml-auto text-sm font-medium text-brand-700 hover:underline">
              Ver cuadro de notas
            </Link>
          </>
        )}
      </header>

      {coursesFailed && <p className="p-6 text-sm text-red-600">{coursesError.message}</p>}
      {courses?.length === 0 && <p className="p-6 text-sm text-zinc-500">No tienes cursos asignados en el ciclo activo.</p>}
      {(loadingCourses || isLoading) && (
        <div className="p-6">
          <Skeleton className="h-80 w-full" />
        </div>
      )}
      {isError && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle className="size-8 text-amber-500" />
          <p className="max-w-md text-sm text-zinc-600">{error.message}</p>
        </div>
      )}
      {sheet && course && <AttendanceSheet key={course.id} sheet={sheet} courseId={course.id} />}
    </div>
  );
}
