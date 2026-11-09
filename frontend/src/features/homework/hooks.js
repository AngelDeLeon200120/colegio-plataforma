import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { getSocket } from '@/lib/socket';
import { homeworkApi } from './api';

export const homeworkKeys = {
  all: ['homework'],
  list: (studentId) => ['homework', 'list', studentId ?? 'me'],
  detail: (activityId, studentId) => ['homework', 'detail', String(activityId), studentId ?? 'me'],
};

/**
 * A quién se está mirando. Estudiante: a sí mismo (null).
 * Familia: el hijo o hija de ?student=, o el primero vinculado.
 */
export function useViewedStudent() {
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const isParent = user?.role === 'PARENT';
  const children = isParent ? (user.children ?? []) : [];

  const requested = Number(searchParams.get('student'));
  const studentId = isParent ? (children.find((child) => child.id === requested) ?? children[0])?.id ?? null : null;

  const selectStudent = (id) =>
    setSearchParams((params) => {
      params.set('student', String(id));
      return params;
    });

  return { isParent, children, studentId, selectStudent };
}

export function useMyActivities(studentId, { enabled = true } = {}) {
  return useQuery({ queryKey: homeworkKeys.list(studentId), queryFn: () => homeworkApi.list(studentId), enabled });
}

export function useMyActivity(activityId, studentId, { enabled = true } = {}) {
  return useQuery({
    queryKey: homeworkKeys.detail(activityId, studentId),
    queryFn: () => homeworkApi.detail(activityId, studentId),
    enabled,
  });
}

/** Cuando el docente revisa (o la entrega se hace desde otro dispositivo), refresca. */
export function useHomeworkLiveUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    // Una nota cambiada (revisión o cuadro de notas) también mueve la boleta
    const onUpdated = () => {
      queryClient.invalidateQueries({ queryKey: homeworkKeys.all });
      queryClient.invalidateQueries({ queryKey: ['report-card'] });
    };
    socket.on('submission:updated', onUpdated);
    socket.on('activity:published', onUpdated);
    return () => {
      socket.off('submission:updated', onUpdated);
      socket.off('activity:published', onUpdated);
    };
  }, [queryClient]);
}
