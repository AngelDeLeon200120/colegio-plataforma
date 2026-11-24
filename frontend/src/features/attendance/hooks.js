import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';

const sheetKey = (courseId) => ['attendance', String(courseId)];

export function useAttendanceSheet(courseId) {
  return useQuery({
    queryKey: sheetKey(courseId),
    queryFn: () => api(`/courses/${courseId}/attendance`),
    enabled: Boolean(courseId),
    // La hoja tiene marcas sin guardar: se pide al abrirla y no se recarga por detrás
    staleTime: Infinity,
    gcTime: 0,
  });
}

/** Guardar o quitar un día actualiza también el cuadro de notas (columna Asistencia). */
function useAttendanceMutation(mutationFn, courseId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.setQueryData(sheetKey(courseId), data);
      queryClient.invalidateQueries({ queryKey: ['gradebook', String(courseId)] });
    },
  });
}

export const useSaveAttendance = (courseId) =>
  useAttendanceMutation((days) => api(`/courses/${courseId}/attendance`, { method: 'PUT', body: { days } }), courseId);

export const useRemoveAttendance = (courseId) =>
  useAttendanceMutation((date) => api(`/courses/${courseId}/attendance?date=${date}`, { method: 'DELETE' }), courseId);
