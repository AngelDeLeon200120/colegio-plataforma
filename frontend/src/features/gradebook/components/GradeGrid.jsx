import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Plus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';
import { formatDate, formatMoney, formatScore } from '@/lib/format';
import { ERROR_LABELS, PASSING_SCORE, accumulatedTotal, average, cellText, parseInput, parseTsv, round, toTsv } from '../gridModel';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function rangeOf({ anchor, active }) {
  return {
    top: Math.min(anchor.row, active.row),
    bottom: Math.max(anchor.row, active.row),
    left: Math.min(anchor.col, active.col),
    right: Math.max(anchor.col, active.col),
  };
}

const isPrintable = (event) => event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

function CellEditor({ value, mode, onChange, onCommit, onCancel }) {
  const ref = useRef(null);

  useEffect(() => {
    const input = ref.current;
    input.focus();
    // "replace": se escribió encima → cursor al final. "edit" (F2/doble clic): todo seleccionado
    if (mode === 'edit') input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }, [mode]);

  const onKeyDown = (event) => {
    const moves = {
      Enter: [event.shiftKey ? -1 : 1, 0],
      Tab: [0, event.shiftKey ? -1 : 1],
      // En modo "replace" las flechas confirman y se mueven, como en Excel
      ...(mode === 'replace' && { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }),
    };
    if (moves[event.key]) {
      event.preventDefault();
      onCommit(...moves[event.key]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
    event.stopPropagation();
  };

  return (
    <input
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => onCommit(0, 0)}
      inputMode="decimal"
      aria-label="Editar nota"
      className="absolute inset-0 z-20 w-full bg-white px-2 text-right text-sm tabular-nums shadow-[0_0_0_2px_var(--color-blue-500)] outline-none"
    />
  );
}

function ItemHeader({ item, readOnly, onEdit }) {
  const Visibility = item.isPublished ? Eye : EyeOff;
  const content = (
    <>
      <span className="block truncate text-xs font-semibold text-zinc-800" title={item.name}>
        {item.name}
      </span>
      <span className="mt-0.5 flex items-center justify-end gap-1 text-[11px] font-normal text-zinc-500 tabular-nums">
        <Visibility
          className={cn('size-3', item.isPublished ? 'text-emerald-600' : 'text-zinc-400')}
          aria-label={item.isPublished ? 'Visible para estudiantes y familias' : 'Oculta para estudiantes y familias'}
        />
        /{formatScore(item.maxScore)} · {formatScore(item.weight)}%
      </span>
    </>
  );

  if (readOnly) return <div className="px-2 py-1.5 text-right">{content}</div>;
  return (
    <button
      type="button"
      onClick={() => onEdit(item)}
      className="w-full px-2 py-1.5 text-right transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none"
      title="Editar columna"
    >
      {content}
    </button>
  );
}

/**
 * Hoja de notas tipo hoja de cálculo.
 * Teclado: flechas, Tab, Enter, F2, Supr, Ctrl+C / Ctrl+V / Ctrl+Z / Ctrl+A, Shift para extender la selección.
 */
/** Índice dentro del bloque de origen que se repite al rellenar (también hacia arriba o a la izquierda). */
const wrap = (index, start, size) => start + ((((index - start) % size) + size) % size);

const inArea = (area, row, col) => area && row >= area.top && row <= area.bottom && col >= area.left && col <= area.right;

// Nota de un estudiante con pagos pendientes: tachada y borrosa para el docente (solo visual)
const OBSCURED = 'text-zinc-400 line-through decoration-red-500 decoration-2 blur-[2.5px]';

export function GradeGrid({ sheet, grid, onEditItem, onAddItem, payment }) {
  const { items, students, readOnly } = sheet;
  const { state, dispatch, getCell, setCells, undo } = grid;
  const containerRef = useRef(null);
  const dragging = useRef(false);
  // Relleno tipo Excel: arrastrar el cuadrito de la selección. Primero se muestra una vista previa
  // y solo al confirmar se escriben las celdas (con un paso de deshacer).
  const [fill, setFill] = useState(null); // { source, target, confirming }
  const fillRef = useRef(null);
  fillRef.current = fill;
  const [paymentDetail, setPaymentDetail] = useState(null); // estudiante cuyo detalle de pago se muestra
  const improvedKeys = useMemo(
    () => new Set(sheet.scores.filter((score) => score.improved).map((score) => `${score.studentId}:${score.gradeItemId}`)),
    [sheet.scores],
  );

  const rowCount = students.length;
  const colCount = items.length;
  // Si se borró una columna o un estudiante, la selección puede quedar fuera de la hoja
  const fit = ({ row, col }) => ({ row: clamp(row, 0, rowCount - 1), col: clamp(col, 0, colCount - 1) });
  const active = fit(state.active);
  const range = rangeOf({ anchor: fit(state.anchor), active });
  const activeStudent = students[active.row];
  const activeItem = items[active.col];

  const focusGrid = () => containerRef.current?.focus({ preventScroll: true });

  useEffect(() => {
    const stop = () => {
      dragging.current = false;
      const current = fillRef.current;
      if (current && !current.confirming) {
        const grew =
          current.target.top !== current.source.top ||
          current.target.bottom !== current.source.bottom ||
          current.target.left !== current.source.left ||
          current.target.right !== current.source.right;
        setFill(grew ? { ...current, confirming: true } : null);
      }
    };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  // Mantener visible la celda activa al navegar con teclado
  useEffect(() => {
    containerRef.current
      ?.querySelector(`[data-cell="${state.active.row}-${state.active.col}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [state.active.row, state.active.col]);

  if (!rowCount || !colCount) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-sm text-zinc-600">
          {!rowCount ? 'No hay estudiantes inscritos en esta sección.' : 'Esta unidad todavía no tiene columnas de notas.'}
        </p>
        {rowCount > 0 && !readOnly && (
          <button type="button" onClick={onAddItem} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
            <Plus className="size-4" /> Agregar la primera columna
          </button>
        )}
      </div>
    );
  }

  const select = (row, col, extend = false) =>
    dispatch({ type: 'SELECT', active: { row: clamp(row, 0, rowCount - 1), col: clamp(col, 0, colCount - 1) }, extend });

  const startEdit = (mode, value) => {
    if (readOnly) return;
    dispatch({ type: 'START_EDIT', mode, value });
  };

  const commitEdit = (rowStep, colStep) => {
    if (!state.editing) return;
    setCells([{ studentId: activeStudent.id, itemId: activeItem.id, raw: state.editing.value }]);
    dispatch({ type: 'STOP_EDIT' });
    if (rowStep || colStep) select(active.row + rowStep, active.col + colStep);
    focusGrid();
  };

  const rangeEntries = (rawFor) => {
    const entries = [];
    for (let row = range.top; row <= range.bottom; row += 1) {
      for (let col = range.left; col <= range.right; col += 1) {
        entries.push({ studentId: students[row].id, itemId: items[col].id, raw: rawFor(row, col) });
      }
    }
    return entries;
  };

  /** Valor que tendría una celda del área de relleno: repite el bloque de origen. */
  const fillRaw = (source, row, col) => {
    const sourceRow = wrap(row, source.top, source.bottom - source.top + 1);
    const sourceCol = wrap(col, source.left, source.right - source.left + 1);
    return cellText(getCell(students[sourceRow].id, items[sourceCol].id));
  };

  const fillEntries = () => {
    if (!fill) return [];
    const entries = [];
    for (let row = fill.target.top; row <= fill.target.bottom; row += 1) {
      for (let col = fill.target.left; col <= fill.target.right; col += 1) {
        if (!inArea(fill.source, row, col)) entries.push({ studentId: students[row].id, itemId: items[col].id, raw: fillRaw(fill.source, row, col) });
      }
    }
    return entries;
  };

  const applyFill = () => {
    const entries = fillEntries();
    setCells(entries);
    dispatch({ type: 'SELECT_RANGE', anchor: { row: fill.target.top, col: fill.target.left }, active: { row: fill.target.bottom, col: fill.target.right } });
    setFill(null);
    focusGrid();
  };

  const cancelFill = () => {
    setFill(null);
    focusGrid();
  };

  const startFill = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragging.current = false;
    setFill({ source: range, target: range, confirming: false });
  };

  /** Como en Excel: el relleno crece solo en la dirección (vertical u horizontal) en que más se arrastró. */
  const extendFill = (row, col) => {
    const { source } = fill;
    const rowsOut = row < source.top ? source.top - row : row > source.bottom ? row - source.bottom : 0;
    const colsOut = col < source.left ? source.left - col : col > source.right ? col - source.right : 0;
    const target =
      rowsOut === 0 && colsOut === 0
        ? source
        : rowsOut >= colsOut
          ? { ...source, top: Math.min(source.top, row), bottom: Math.max(source.bottom, row) }
          : { ...source, left: Math.min(source.left, col), right: Math.max(source.right, col) };
    setFill({ ...fill, target });
  };

  const onKeyDown = (event) => {
    if (state.editing) return;
    if (fill?.confirming) {
      event.preventDefault();
      if (event.key === 'Enter') applyFill();
      else if (event.key === 'Escape') cancelFill();
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const { row, col } = active;
    const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

    if (arrows[event.key]) {
      event.preventDefault();
      const [dr, dc] = arrows[event.key];
      // Ctrl+flecha salta al borde, como en Excel
      if (mod) select(dr ? (dr < 0 ? 0 : rowCount - 1) : row, dc ? (dc < 0 ? 0 : colCount - 1) : col, event.shiftKey);
      else select(row + dr, col + dc, event.shiftKey);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      select(row, col + (event.shiftKey ? -1 : 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      select(row + (event.shiftKey ? -1 : 1), col);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const edgeCol = event.key === 'Home' ? 0 : colCount - 1;
      select(mod ? (event.key === 'Home' ? 0 : rowCount - 1) : row, edgeCol, event.shiftKey);
    } else if (event.key === 'F2') {
      event.preventDefault();
      startEdit('edit', cellText(getCell(activeStudent.id, activeItem.id)));
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      setCells(rangeEntries(() => ''));
    } else if (event.key === 'Escape') {
      select(row, col);
    } else if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      dispatch({ type: 'SELECT_RANGE', anchor: { row: 0, col: 0 }, active: { row: rowCount - 1, col: colCount - 1 } });
    } else if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    } else if (isPrintable(event)) {
      event.preventDefault();
      startEdit('replace', event.key);
    }
  };

  const onCopy = (event) => {
    if (state.editing) return;
    event.preventDefault();
    const matrix = [];
    for (let row = range.top; row <= range.bottom; row += 1) {
      const line = [];
      for (let col = range.left; col <= range.right; col += 1) line.push(cellText(getCell(students[row].id, items[col].id)));
      matrix.push(line);
    }
    event.clipboardData.setData('text/plain', toTsv(matrix));
  };

  const onPaste = (event) => {
    if (state.editing || readOnly) return;
    event.preventDefault();
    const matrix = parseTsv(event.clipboardData.getData('text/plain'));
    if (!matrix.length) return;

    // Un solo valor sobre un rango: rellena todo el rango
    if (matrix.length === 1 && matrix[0].length === 1) {
      setCells(rangeEntries(() => matrix[0][0]));
      return;
    }

    const entries = [];
    matrix.forEach((line, dr) =>
      line.forEach((raw, dc) => {
        const row = range.top + dr;
        const col = range.left + dc;
        if (row < rowCount && col < colCount) entries.push({ studentId: students[row].id, itemId: items[col].id, raw });
      }),
    );
    setCells(entries);
    dispatch({
      type: 'SELECT_RANGE',
      anchor: { row: range.top, col: range.left },
      active: { row: Math.min(range.top + matrix.length - 1, rowCount - 1), col: Math.min(range.left + Math.max(...matrix.map((l) => l.length)) - 1, colCount - 1) },
    });
  };

  const onCellMouseDown = (event, row, col) => {
    if (event.button !== 0) return;
    event.preventDefault(); // sin selección de texto del navegador
    if (fill?.confirming) return;
    if (state.editing) commitEdit(0, 0);
    select(row, col, event.shiftKey);
    dragging.current = true;
    focusGrid();
  };

  const onCellMouseEnter = (row, col) => {
    if (fill && !fill.confirming) extendFill(row, col);
    else if (dragging.current) select(row, col, true);
  };

  const scrollBy = (direction) => containerRef.current?.scrollBy({ left: direction * 336, behavior: 'smooth' });
  const fillCount = fill?.confirming ? fillEntries().length : 0;

  const valueOf = (student) => (item) => {
    const cell = getCell(student.id, item.id);
    return cell.error ? null : cell.value;
  };

  const weightSum = items.reduce((sum, item) => sum + item.weight, 0);
  const totals = students.map((student) => accumulatedTotal(items, valueOf(student)));

  const activeCell = getCell(activeStudent.id, activeItem.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {fill?.confirming && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
          <span>
            <span className="font-semibold">Vista previa del relleno:</span> {fillCount} celda{fillCount === 1 ? '' : 's'} (en azul punteado). Revisa los valores antes de
            aplicarlos.
          </span>
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={cancelFill} className="rounded-full border border-blue-300 bg-white px-3 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100">
              Cancelar <span className="text-blue-500">(Esc)</span>
            </button>
            <button type="button" onClick={applyFill} className="rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">
              Aplicar relleno <span className="text-blue-200">(Enter)</span>
            </button>
          </span>
        </div>
      )}
      <div
        ref={containerRef}
        tabIndex={0}
        role="grid"
        aria-label="Cuadro de notas"
        aria-rowcount={rowCount + 1}
        aria-colcount={colCount + 3}
        aria-readonly={readOnly || undefined}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onPaste={onPaste}
        className="min-h-0 flex-1 overflow-x-scroll overflow-y-auto bg-white [scrollbar-color:var(--color-zinc-400)_var(--color-zinc-100)] focus:outline-none [scroll-padding-left:304px] [scroll-padding-top:48px]"
      >
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 w-20 min-w-20 border-r border-b border-zinc-200 bg-zinc-50 px-3 text-left text-xs font-medium text-zinc-500">
                Código
              </th>
              <th className="sticky top-0 left-20 z-30 w-56 min-w-56 border-r border-b border-zinc-200 bg-zinc-50 px-3 text-left text-xs font-medium text-zinc-500 shadow-[1px_0_0_var(--color-zinc-200)]">
                Estudiante
              </th>
              {items.map((item, col) => (
                <th
                  key={item.id}
                  scope="col"
                  className={cn(
                    'sticky top-0 z-20 w-28 min-w-28 max-w-28 border-r border-b border-zinc-200 bg-zinc-50 p-0',
                    col >= range.left && col <= range.right && 'bg-blue-50',
                  )}
                >
                  <ItemHeader item={item} readOnly={readOnly} onEdit={onEditItem} />
                </th>
              ))}
              <th className="sticky top-0 z-20 w-24 min-w-24 border-b border-zinc-200 bg-zinc-100 px-2 py-1.5 text-right">
                <span className="block text-xs font-semibold text-zinc-800">Total</span>
                <span className={cn('mt-0.5 block text-[11px] font-normal tabular-nums', weightSum === 100 ? 'text-zinc-500' : 'text-amber-700')}>
                  pesos {formatScore(weightSum)}%
                </span>
              </th>
              {!readOnly && (
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-1">
                  <button
                    type="button"
                    onClick={onAddItem}
                    className="flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
                    aria-label="Agregar columna"
                    title="Agregar columna"
                  >
                    <Plus className="size-4" />
                  </button>
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {students.map((student, row) => {
              const rowSelected = row >= range.top && row <= range.bottom;
              const total = totals[row];
              const unpaid = Boolean(payment?.unpaid.has(student.id));
              const obscured = unpaid && payment.obscure;
              return (
                <tr key={student.id}>
                  <td className={cn('sticky left-0 z-10 border-r border-b border-zinc-200 bg-white px-3 font-mono text-xs text-zinc-500', rowSelected && 'bg-blue-50')}>
                    {student.code}
                  </td>
                  <th
                    scope="row"
                    className={cn(
                      'sticky left-20 z-10 max-w-56 truncate border-r border-b border-zinc-200 bg-white px-3 text-left font-normal text-zinc-900 shadow-[1px_0_0_var(--color-zinc-200)]',
                      rowSelected && 'bg-blue-50',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">
                        {student.lastName}, {student.firstName}
                      </span>
                      {unpaid && (
                        <button
                          type="button"
                          onClick={() => setPaymentDetail(student)}
                          className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 hover:bg-red-100"
                          title="Ver el detalle del pago pendiente"
                        >
                          <Wallet className="size-3" /> Pago pendiente
                        </button>
                      )}
                    </span>
                  </th>

                  {items.map((item, col) => {
                    const cell = getCell(student.id, item.id);
                    const isActive = row === active.row && col === active.col;
                    const inRange = rowSelected && col >= range.left && col <= range.right;
                    const improved = improvedKeys.has(`${student.id}:${item.id}`) && !cell.dirty && !cell.error;
                    const previewRaw = fill && inArea(fill.target, row, col) && !inArea(fill.source, row, col) ? fillRaw(fill.source, row, col) : null;
                    const previewError = previewRaw !== null && parseInput(previewRaw, item.maxScore).error;
                    const showHandle = !readOnly && !state.editing && !fill && row === range.bottom && col === range.right;
                    return (
                      <td
                        key={item.id}
                        data-cell={`${row}-${col}`}
                        role="gridcell"
                        aria-selected={inRange}
                        aria-invalid={Boolean(cell.error) || undefined}
                        onMouseDown={(event) => onCellMouseDown(event, row, col)}
                        onMouseEnter={() => onCellMouseEnter(row, col)}
                        onDoubleClick={() => startEdit('edit', cellText(cell))}
                        className={cn(
                          'relative h-9 cursor-cell border-r border-b border-zinc-200 px-2 text-right tabular-nums select-none',
                          readOnly ? 'text-zinc-500' : 'text-zinc-900',
                          inRange && !isActive && 'bg-blue-50',
                          cell.error && 'bg-red-50 text-red-700',
                          improved && !inRange && 'bg-sky-50',
                          improved && 'font-semibold text-blue-700',
                          previewRaw !== null && 'bg-blue-50/70 italic outline-1 -outline-offset-2 outline-blue-400 outline-dashed',
                          previewError && 'bg-red-50 text-red-600',
                          isActive && 'z-[5] shadow-[inset_0_0_0_2px_var(--color-blue-500)]',
                        )}
                        title={improved ? 'Nota mejorada (ver historial con el botón Mejora)' : undefined}
                      >
                        {improved && (
                          <span
                            className="absolute top-0 left-0 size-0 border-t-[7px] border-r-[7px] border-t-blue-600 border-r-transparent"
                            aria-label="Nota mejorada"
                          />
                        )}
                        {previewRaw !== null ? (
                          previewRaw
                        ) : cell.error ? (
                          cell.raw
                        ) : cell.value === null ? (
                          ''
                        ) : (
                          <span className={cn(obscured && OBSCURED)}>{formatScore(cell.value)}</span>
                        )}
                        {showHandle && (
                          <span
                            onMouseDown={startFill}
                            className="absolute -right-1 -bottom-1 z-20 size-2.5 cursor-crosshair border border-white bg-blue-600"
                            title="Arrastra para rellenar"
                            aria-label="Rellenar arrastrando"
                          />
                        )}
                        {(cell.dirty || cell.saving) && (
                          <span
                            className={cn('absolute top-1 right-1 size-1.5 rounded-full', cell.saving ? 'animate-pulse bg-blue-500' : 'bg-amber-500')}
                            aria-label={cell.saving ? 'Guardando' : 'Sin guardar'}
                          />
                        )}
                        {isActive && state.editing && (
                          <CellEditor
                            value={state.editing.value}
                            mode={state.editing.mode}
                            onChange={(value) => dispatch({ type: 'UPDATE_EDIT', value })}
                            onCommit={commitEdit}
                            onCancel={() => {
                              dispatch({ type: 'STOP_EDIT' });
                              focusGrid();
                            }}
                          />
                        )}
                      </td>
                    );
                  })}

                  <td
                    className={cn(
                      'border-b border-zinc-200 bg-zinc-50 px-2 text-right font-semibold tabular-nums',
                      total !== null && total < PASSING_SCORE ? 'text-red-600' : 'text-zinc-900',
                    )}
                  >
                    {total === null ? '—' : <span className={cn(obscured && OBSCURED)}>{formatScore(round(total))}</span>}
                  </td>
                  {!readOnly && <td className="border-b border-zinc-200" />}
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <td className="sticky bottom-0 left-0 z-20 border-t border-r border-zinc-200 bg-zinc-50" />
              <th
                scope="row"
                className="sticky bottom-0 left-20 z-20 border-t border-r border-zinc-200 bg-zinc-50 px-3 text-left text-xs font-medium text-zinc-500 shadow-[1px_0_0_var(--color-zinc-200)]"
              >
                Promedio de la clase
              </th>
              {items.map((item) => {
                const mean = average(students.map((student) => valueOf(student)(item)));
                return (
                  <td key={item.id} className="sticky bottom-0 z-10 h-9 border-t border-r border-zinc-200 bg-zinc-50 px-2 text-right text-xs text-zinc-600 tabular-nums">
                    {formatScore(round(mean))}
                  </td>
                );
              })}
              <td className="sticky bottom-0 z-10 border-t border-zinc-200 bg-zinc-100 px-2 text-right text-xs font-semibold tabular-nums">
                {formatScore(round(average(totals)))}
              </td>
              {!readOnly && <td className="sticky bottom-0 border-t border-zinc-200 bg-zinc-50" />}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex min-h-8 items-center gap-2 border-t border-zinc-200 bg-white px-4 py-1.5 text-xs text-zinc-500" aria-live="polite">
        <span className="truncate">
          <span className="font-medium text-zinc-700">
            {activeStudent.lastName}, {activeStudent.firstName}
          </span>{' '}
          · {activeItem.name} (máx. {formatScore(activeItem.maxScore)})
        </span>
        {activeCell.error && (
          <span className="shrink-0 font-medium text-red-600">
            {ERROR_LABELS[activeCell.error]}
            {activeCell.error === 'SCORE_OUT_OF_RANGE' && ` (0 a ${formatScore(activeItem.maxScore)})`}
          </span>
        )}
        {improvedKeys.has(`${activeStudent.id}:${activeItem.id}`) && <span className="shrink-0 font-medium text-blue-700">Nota mejorada</span>}
        {range.bottom - range.top + (range.right - range.left) > 0 && (
          <span className="ml-auto shrink-0">
            {(range.bottom - range.top + 1) * (range.right - range.left + 1)} celdas seleccionadas
          </span>
        )}
        <span className={cn('flex shrink-0 items-center gap-0.5', range.bottom - range.top + (range.right - range.left) === 0 && 'ml-auto')}>
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            className="flex size-6 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100"
            aria-label="Desplazar a la izquierda"
            title="Desplazar a la izquierda"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            className="flex size-6 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100"
            aria-label="Desplazar a la derecha"
            title="Desplazar a la derecha"
          >
            <ChevronRight className="size-4" />
          </button>
        </span>
      </div>

      {paymentDetail && (
        <PaymentDetailDialog student={paymentDetail} charges={payment?.details[paymentDetail.id] ?? []} onClose={() => setPaymentDetail(null)} />
      )}
    </div>
  );
}

/** Detalle del pago pendiente de un estudiante en la unidad (para el docente). */
function PaymentDetailDialog({ student, charges, onClose }) {
  const total = charges.reduce((sum, charge) => sum + charge.balance, 0);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Pago pendiente · ${student.firstName} ${student.lastName}`}
      description="Cobros de esta unidad vencidos y sin pagar. Sus notas se ven tachadas hasta que la administración registre el pago."
      footer={<Button onClick={onClose}>Cerrar</Button>}
    >
      {charges.length === 0 ? (
        <p className="text-sm text-zinc-500">Ya no tiene pagos pendientes en esta unidad.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="pb-2 text-left font-medium">Concepto</th>
              <th className="pb-2 text-left font-medium">Venció</th>
              <th className="pb-2 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {charges.map((charge) => (
              <tr key={`${charge.description}-${charge.dueDate}`}>
                <td className="py-2 pr-2 text-zinc-800">
                  {charge.description}
                  {charge.status === 'PARTIAL' && <span className="ml-1.5 text-xs text-amber-700">(abono parcial)</span>}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-zinc-600">
                  {formatDate(charge.dueDate)}
                  <span className="block text-xs text-red-600">
                    {charge.daysOverdue === 0 ? 'vence hoy' : `${charge.daysOverdue} día${charge.daysOverdue === 1 ? '' : 's'} de atraso`}
                  </span>
                </td>
                <td className="py-2 text-right font-medium whitespace-nowrap text-zinc-900 tabular-nums">{formatMoney(charge.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200">
              <td colSpan={2} className="pt-2 text-right text-xs font-medium text-zinc-500">
                Total pendiente
              </td>
              <td className="pt-2 text-right font-semibold whitespace-nowrap text-red-700 tabular-nums">{formatMoney(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </Dialog>
  );
}
