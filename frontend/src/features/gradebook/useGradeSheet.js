import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { gradebookApi } from './api';
import { cellKey, cellText, parseInput } from './gridModel';
import { mergeScores } from './hooks';

const AUTOSAVE_DELAY_MS = 700;
const MAX_UNDO = 100;

const initialState = {
  overrides: {}, // key → { value } | { raw, error }: lo que difiere del servidor
  dirty: {}, // key → true: válido y pendiente de guardar
  saving: {}, // key → valor enviado, en vuelo
  active: { row: 0, col: 0 },
  anchor: { row: 0, col: 0 },
  editing: null, // { value, mode: 'replace' | 'edit' }
  undo: [],
};

const without = (object, keys) => {
  const copy = { ...object };
  for (const key of keys) delete copy[key];
  return copy;
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CELLS': {
      const overrides = { ...state.overrides };
      const dirty = { ...state.dirty };
      for (const { key, parsed, matchesServer } of action.changes) {
        if (parsed.error) {
          overrides[key] = { raw: parsed.raw, error: parsed.error };
          delete dirty[key];
        } else if (matchesServer && !(key in state.saving)) {
          delete overrides[key];
          delete dirty[key];
        } else {
          overrides[key] = { value: parsed.value };
          dirty[key] = true;
        }
      }
      const undo = action.undo ? [...state.undo, action.undo].slice(-MAX_UNDO) : state.undo;
      return { ...state, overrides, dirty, undo };
    }
    case 'SAVE_STARTED': {
      const saving = { ...state.saving };
      for (const key of action.keys) saving[key] = state.overrides[key].value;
      return { ...state, saving, dirty: without(state.dirty, action.keys) };
    }
    case 'SAVE_SUCCEEDED': {
      const overrides = { ...state.overrides };
      for (const key of action.keys) {
        // Si se volvió a editar mientras se guardaba, el override nuevo se queda
        if (!state.dirty[key] && overrides[key]?.value === state.saving[key]) delete overrides[key];
      }
      return { ...state, overrides, saving: without(state.saving, action.keys) };
    }
    case 'SAVE_FAILED': {
      const overrides = { ...state.overrides };
      const dirty = { ...state.dirty };
      for (const key of action.keys) {
        const cellError = action.cellErrors?.[key];
        if (cellError) {
          overrides[key] = { raw: String(state.saving[key] ?? ''), error: cellError };
          delete dirty[key];
        } else if (!(key in dirty) && overrides[key]) {
          dirty[key] = true;
        }
      }
      return { ...state, overrides, dirty, saving: without(state.saving, action.keys) };
    }
    case 'POP_UNDO':
      return { ...state, undo: state.undo.slice(0, -1) };
    case 'SELECT':
      return {
        ...state,
        active: action.active,
        anchor: action.extend ? state.anchor : action.active,
        editing: null,
      };
    case 'SELECT_RANGE':
      return { ...state, anchor: action.anchor, active: action.active, editing: null };
    case 'START_EDIT':
      return { ...state, editing: { value: action.value, mode: action.mode } };
    case 'UPDATE_EDIT':
      return state.editing ? { ...state, editing: { ...state.editing, value: action.value } } : state;
    case 'STOP_EDIT':
      return { ...state, editing: null };
    default:
      throw new Error(`Acción desconocida: ${action.type}`);
  }
}

/**
 * Estado de la hoja: celdas del servidor + cambios locales, autoguardado por lotes,
 * deshacer y selección. La caché de React Query guarda lo que ya está en el servidor.
 */
export function useGradeSheet({ courseId, sheet, sheetKey }) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [saveStatus, setSaveStatus] = useState({ state: 'idle' });
  const stateRef = useRef(state);
  stateRef.current = state;
  const inFlight = useRef(false);

  const { items, students, readOnly, unit } = sheet;
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const studentIds = useMemo(() => new Set(students.map((student) => student.id)), [students]);
  const server = useMemo(
    () => new Map(sheet.scores.map((score) => [cellKey(score.studentId, score.gradeItemId), score.score])),
    [sheet.scores],
  );

  /** Valor efectivo de una celda: cambio local si existe, si no lo del servidor. */
  const getCell = useCallback(
    (studentId, itemId) => {
      const key = cellKey(studentId, itemId);
      const override = state.overrides[key];
      return {
        ...(override ?? { value: server.get(key) ?? null }),
        dirty: Boolean(state.dirty[key]),
        saving: key in state.saving,
      };
    },
    [state.overrides, state.dirty, state.saving, server],
  );

  /** entries: [{ studentId, itemId, raw }]. Registra un paso de deshacer. */
  const setCells = useCallback(
    (entries, { recordUndo = true } = {}) => {
      if (readOnly) return;
      const current = stateRef.current;
      const changes = [];
      const undo = [];

      for (const { studentId, itemId, raw } of entries) {
        const item = itemsById.get(itemId);
        if (!item) continue;
        const key = cellKey(studentId, itemId);
        const before = current.overrides[key] ?? { value: server.get(key) ?? null };
        const parsed = parseInput(raw, item.maxScore);
        if (!parsed.error && !before.error && parsed.value === before.value) continue;

        changes.push({
          key,
          parsed: parsed.error ? { ...parsed, raw: String(raw) } : parsed,
          matchesServer: !parsed.error && parsed.value === (server.get(key) ?? null),
        });
        undo.push({ studentId, itemId, raw: cellText(before) });
      }

      if (!changes.length) return;
      dispatch({ type: 'SET_CELLS', changes, undo: recordUndo ? undo : null });
      setSaveStatus((status) => (status.state === 'error' ? { state: 'idle' } : status));
    },
    [readOnly, itemsById, server],
  );

  const undo = useCallback(() => {
    const last = stateRef.current.undo.at(-1);
    if (!last) return null;
    dispatch({ type: 'POP_UNDO' });
    setCells(last, { recordUndo: false });
    return last;
  }, [setCells]);

  const flush = useCallback(async () => {
    const current = stateRef.current;
    const keys = Object.keys(current.dirty).filter((key) => {
      const [studentId, itemId] = key.split(':').map(Number);
      return studentIds.has(studentId) && itemsById.has(itemId);
    });
    if (!keys.length || inFlight.current) return;

    const cells = keys.map((key) => {
      const [studentId, gradeItemId] = key.split(':').map(Number);
      return { studentId, gradeItemId, score: current.overrides[key].value };
    });

    inFlight.current = true;
    dispatch({ type: 'SAVE_STARTED', keys });
    setSaveStatus({ state: 'saving' });

    try {
      const result = await gradebookApi.saveCells(courseId, { unitId: unit.id, cells });
      queryClient.setQueryData(sheetKey, (data) => mergeScores(data, result.cells));
      dispatch({ type: 'SAVE_SUCCEEDED', keys });
      setSaveStatus({ state: 'saved', at: new Date() });
    } catch (error) {
      const cellErrors =
        error.code === 'INVALID_CELLS'
          ? Object.fromEntries(error.details.map((detail) => [cellKey(detail.studentId, detail.gradeItemId), detail.code]))
          : null;
      dispatch({ type: 'SAVE_FAILED', keys, cellErrors });
      // Errores por celda: se marcan en rojo y el resto se reintenta solo.
      // Cualquier otro error (red, sesión, unidad cerrada) espera a que el usuario reintente.
      setSaveStatus(cellErrors ? { state: 'idle' } : { state: 'error', message: error.message });
    } finally {
      inFlight.current = false;
    }
  }, [courseId, unit.id, queryClient, sheetKey, studentIds, itemsById]);

  const pendingCount = Object.keys(state.dirty).length;
  const savingCount = Object.keys(state.saving).length;

  // Autoguardado: agrupa los cambios de los últimos instantes en un solo PUT
  useEffect(() => {
    if (!pendingCount || savingCount || saveStatus.state === 'error') return undefined;
    const timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.dirty, pendingCount, savingCount, saveStatus.state, flush]);

  // Avisar antes de cerrar la pestaña con cambios sin guardar
  useEffect(() => {
    if (!pendingCount && !savingCount) return undefined;
    const onBeforeUnload = (event) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [pendingCount, savingCount]);

  const retry = useCallback(() => {
    setSaveStatus({ state: 'idle' });
    flush();
  }, [flush]);

  const errorCount = Object.values(state.overrides).filter((override) => override.error).length;

  return {
    state,
    dispatch,
    getCell,
    setCells,
    undo,
    retry,
    saveStatus,
    pendingCount: pendingCount + savingCount,
    errorCount,
  };
}
