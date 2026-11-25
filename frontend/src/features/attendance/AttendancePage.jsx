import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useSearchParams } from 'react-router';
import { AlertTriangle, CheckCheck, Clock, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { FormError } from '@/components/ui/Field';
import { Kbd } from '@/components/ui/Kbd';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMyCourses } from '@/features/gradebook/hooks';
import { cn } from '@/lib/cn';
import { formatDate, formatScore } from '@/lib/format';
import { useAttendanceSheet, useRemoveAttendance, useSaveAttendance } from './hooks';
import { ABSENT, MAX_NOTE, PRESENT, cellKey, changedDates, effectiveStatus, noteOf, summarize, toDays, withChange } from './model';

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

/** Hoja de asistencia: una fila por estudiante y una columna por día, con check o equis y una nota opcional. */
function AttendanceSheet({ sheet, courseId }) {
  const [changes, setChanges] = useState({}); // "fecha:estudiante" → { status?, note? } sin guardar
  const [active, setActive] = useState({ row: 0, date: sheet.today });
  const [notice, setNotice] = useState(null);
  const [removing, setRemoving] = useState(false);
  const save = useSaveAttendance(courseId);
  const gridRef = useRef(null);
  const noteRef = useRef(null);

  const { students } = sheet;
  // El día de hoy entra solo, aunque todavía no se haya pasado lista
  const dates = useMemo(() => [...new Set([...Object.keys(sheet.days), sheet.today])].sort(), [sheet.days, sheet.today]);
  const touched = changedDates(changes);
  const dirty = touched.size > 0;
  const activeDate = dates.includes(active.date) ? active.date : sheet.today;
  const activeRow = clamp(active.row, 0, students.length - 1);
  const activeSaved = Boolean(sheet.days[activeDate]);

  // La celda activa queda a la vista (al abrir, la de hoy)
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

  const change = (date, studentId, patch) => {
    setNotice(null);
    setChanges((current) => withChange(sheet, current, date, studentId, patch));
  };
  const togglePresent = (date, studentId) =>
    change(date, studentId, { status: effectiveStatus(sheet, changes, touched, date, studentId) === PRESENT ? ABSENT : PRESENT });
  const markAll = () => students.forEach((student) => change(activeDate, student.id, { status: PRESENT }));

  const activeStudent = students[activeRow];
  const activeStatus = activeStudent && effectiveStatus(sheet, changes, touched, activeDate, activeStudent.id);
  const activeNote = activeStudent ? noteOf(sheet, changes, activeDate, activeStudent.id) : '';
  // Una nota en una celda sin marcar (p. ej. "Llegó tarde") cuenta como que asistió
  const setNote = (note) => change(activeDate, activeStudent.id, activeStatus || !note ? { note } : { note, status: PRESENT });
  const arrivedLate = () => change(activeDate, activeStudent.id, { status: PRESENT, note: 'Llegó tarde' });

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
      togglePresent(activeDate, activeStudent.id);
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      noteRef.current?.focus();
    }
  };

  const onCell = (row, date) => {
    setActive({ row, date });
    togglePresent(date, students[row].id);
    gridRef.current?.focus({ preventScroll: true });
  };

  /** Escribir la nota de una celda sin cambiar su marca. */
  const openNote = (row, date) => {
    setActive({ row, date });
    noteRef.current?.focus();
  };

  if (!students.length) return <p className="py-10 text-center text-sm text-zinc-500">No hay estudiantes inscritos en esta sección.</p>;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2 sm:px-6">
        <span className="text-sm font-medium text-zinc-900 first-letter:uppercase">{longDate(activeDate)}</span>
        <Button size="sm" onClick={markAll}>
          <CheckCheck className="size-4" /> Todos asistieron
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

      {/* Barra de la celda activa, como la de fórmulas de una hoja de cálculo */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-1.5 sm:px-6">
        <span className="max-w-56 truncate text-sm font-medium text-zinc-900">
          {activeStudent.lastName}, {activeStudent.firstName}
        </span>
        <span className="text-xs text-zinc-500">{formatDate(activeDate, { day: 'numeric', month: 'short' })}</span>
        <input
          ref={noteRef}
          value={activeNote}
          maxLength={MAX_NOTE}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== 'Escape') return;
            event.preventDefault();
            gridRef.current?.focus({ preventScroll: true });
          }}
          placeholder="Nota de este día, ej. Llegó tarde"
          aria-label={`Nota de ${activeStudent.firstName} ${activeStudent.lastName}`}
          className={cn(inputClass, 'h-8 min-w-40 flex-1')}
        />
        <Button size="sm" onClick={arrivedLate} title="Marca que asistió y anota que llegó tarde">
          <Clock className="size-3.5" /> Llegó tarde
        </Button>
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
              <th className={cn(CELL, HEAD, 'min-w-20 bg-white px-2 text-center text-xs font-bold')}>Asistencia</th>
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
                        note={noteOf(sheet, changes, date, student.id)}
                        changed={cellKey(date, student.id) in changes}
                        label={`${name}, ${formatDate(date, { day: 'numeric', month: 'long' })}`}
                        onClick={() => onCell(row, date)}
                        onNote={() => openNote(row, date)}
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
                Asistencia
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
          <span className="font-bold text-emerald-700">✓</span> asistió
        </span>
        <span className="flex items-center gap-1">
          <span className="font-bold text-red-600">✗</span> faltó
        </span>
        <span className="flex items-center gap-1">
          <MessageSquare className="size-3 fill-amber-300 text-amber-600" /> tiene nota
        </span>
        <span className="max-lg:hidden">
          Flechas para moverte · <Kbd>Espacio</Kbd> marcar · <Kbd>N</Kbd> nota
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
  [PRESENT]: { text: '✓', label: 'asistió', className: 'text-emerald-700' },
  [ABSENT]: { text: '✗', label: 'faltó', className: 'text-red-600' },
};

function DayCell({ id, status, note, active, changed, label, onClick, onNote }) {
  const mark = MARKS[status];
  return (
    <td
      data-cell={id}
      role="gridcell"
      onClick={onClick}
      onContextMenu={(event) => {
        event.preventDefault();
        onNote();
      }}
      title={note || undefined}
      aria-label={`${label}: ${mark?.label ?? 'sin marcar'}${note ? `. Nota: ${note}` : ''}`}
      className={cn(
        CELL,
        'group relative h-8 cursor-pointer text-center text-base font-bold select-none hover:bg-emerald-50',
        mark?.className,
        changed && 'bg-amber-50',
        active && 'shadow-[inset_0_0_0_2px_var(--color-blue-500)]',
      )}
    >
      {mark?.text}
      <button
        type="button"
        tabIndex={-1}
        onClick={(event) => {
          event.stopPropagation();
          onNote();
        }}
        aria-label={`${note ? 'Ver la nota' : 'Poner nota'} de ${label}`}
        className={cn('absolute inset-y-0 right-0 flex w-5 items-center justify-center', !note && !active && 'opacity-0 group-hover:opacity-100')}
      >
        <MessageSquare className={cn('size-3', note ? 'fill-amber-300 text-amber-600' : 'text-zinc-400')} />
      </button>
    </td>
  );
}

/** Asistencias: el docente pasa lista en una hoja; la nota va sola a la columna Asistencia del cuadro. */
export function AttendancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: courses, isLoading: loadingCourses, isError: coursesFailed, error: coursesError } = useMyCourses();
  const requested = searchParams.get('course');
  const course = courses?.find((item) => String(item.id) === requested) ?? courses?.[0];
  const { data: sheet, isLoading, isError, error, refetch } = useAttendanceSheet(course?.id);

  // Si la página se queda abierta hasta otro día, al volver a ella entra la columna del nuevo hoy
  useEffect(() => {
    const opened = new Date().toDateString();
    const onVisible = () => document.visibilityState === 'visible' && new Date().toDateString() !== opened && refetch();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetch]);

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
