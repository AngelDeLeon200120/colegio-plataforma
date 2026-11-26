import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/features/auth/store';
import { gradebookApi } from './api';
import { cellKey, sheetOrder } from './gridModel';

export const gradebookKeys = {
  courses: ['me', 'courses'],
  sheet: (courseId, unitId) => ['gradebook', String(courseId), unitId ? String(unitId) : 'current'],
  all: (courseId) => ['gradebook', String(courseId)],
};

export function useMyCourses({ enabled = true } = {}) {
  return useQuery({ queryKey: gradebookKeys.courses, queryFn: gradebookApi.myCourses, enabled });
}

export function useGradebookSheet(courseId, unitId) {
  return useQuery({
    queryKey: gradebookKeys.sheet(courseId, unitId),
    queryFn: () => gradebookApi.getSheet(courseId, unitId),
    // Asistencia se muestra al final, a la par de la Nota final (la hoja, el teclado y la barra usan este orden)
    select: (sheet) => ({ ...sheet, items: sheetOrder(sheet.items) }),
    // La hoja tiene sus propios cambios locales: no recargar por detrás; solo al abrirla o si cambian sus columnas
    staleTime: Infinity,
    refetchOnMount: 'always',
  });
}

/**
 * Estudiantes con pagos pendientes en la unidad (solo ids). Consulta aparte de la hoja:
 * se refresca sola cuando la administración registra un pago, sin tocar las celdas editadas.
 */
export function usePaymentStatus(courseId, unitId) {
  const queryClient = useQueryClient();
  const queryKey = ['gradebook-payments', String(courseId), String(unitId)];

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['gradebook-payments'] });
    socket.on('finance:status_changed', refresh);
    return () => socket.off('finance:status_changed', refresh);
  }, [queryClient]);

  return useQuery({
    queryKey,
    queryFn: () => gradebookApi.paymentStatus(courseId, unitId),
    enabled: Boolean(courseId && unitId),
    staleTime: 60_000,
  });
}

/** Mezcla celdas guardadas (propias o de otro editor) en la caché de la hoja. */
export function mergeScores(sheet, cells) {
  if (!sheet) return sheet;
  const byKey = new Map(sheet.scores.map((score) => [cellKey(score.studentId, score.gradeItemId), score]));
  for (const cell of cells) {
    byKey.set(cellKey(cell.studentId, cell.gradeItemId), { ...byKey.get(cellKey(cell.studentId, cell.gradeItemId)), ...cell });
  }
  return { ...sheet, scores: [...byKey.values()] };
}

/**
 * Tras mezclar celdas: si había una recarga en curso, pudo leer los datos de antes del guardado.
 * Se descarta y se pide de nuevo para no pisar la nota recién puesta.
 */
export function discardStaleFetch(queryClient, sheetKey) {
  if (queryClient.isFetching({ queryKey: sheetKey, exact: true })) queryClient.invalidateQueries({ queryKey: sheetKey, exact: true });
}

function useInvalidateSheet(courseId) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: gradebookKeys.all(courseId) });
}

export function useCreateItem(courseId) {
  const invalidate = useInvalidateSheet(courseId);
  return useMutation({ mutationFn: (body) => gradebookApi.createItem(courseId, body), onSuccess: invalidate });
}

export function useUpdateItem(courseId) {
  const invalidate = useInvalidateSheet(courseId);
  return useMutation({ mutationFn: ({ itemId, ...body }) => gradebookApi.updateItem(itemId, body), onSuccess: invalidate });
}

export function useDeleteItem(courseId) {
  const invalidate = useInvalidateSheet(courseId);
  return useMutation({ mutationFn: ({ itemId, force }) => gradebookApi.deleteItem(itemId, { force }), onSuccess: invalidate });
}

/** Cambios sobre la misma hoja en vivo: notas de otros editores y columnas nuevas o modificadas (también propias, desde otra pestaña). */
export function useGradebookLiveUpdates(courseId, sheetKey) {
  const queryClient = useQueryClient();
  const myId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (!courseId || !sheetKey) return undefined;

    const socket = getSocket();
    const refreshSheets = () => queryClient.invalidateQueries({ queryKey: gradebookKeys.all(courseId) });
    const subscribe = (onJoined) => socket.emit('course:subscribe', { courseId: Number(courseId) }, onJoined);
    // Al reconectar, ponerse al día con lo que cambió mientras no había conexión
    const onConnect = () => subscribe(refreshSheets);
    const unitId = () => queryClient.getQueryData(sheetKey)?.unit.id;

    const onCells = ({ data }) => {
      if (data.updatedBy === myId || data.unitId !== unitId()) return;
      queryClient.setQueryData(sheetKey, (sheet) => mergeScores(sheet, data.cells));
      discardStaleFetch(queryClient, sheetKey);
    };
    const onItems = ({ data }) => {
      if (data.courseId === Number(courseId)) refreshSheets();
    };

    subscribe(() => {});
    socket.on('connect', onConnect);
    socket.on('gradebook:cells_updated', onCells);
    socket.on('gradebook:items_changed', onItems);
    return () => {
      socket.off('connect', onConnect);
      socket.off('gradebook:cells_updated', onCells);
      socket.off('gradebook:items_changed', onItems);
    };
  }, [courseId, sheetKey, myId, queryClient]);
}
