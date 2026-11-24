import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import { activitiesApi } from './api';

export const activityKeys = {
  all: ['teacher-activities'],
  list: (filters) => ['teacher-activities', filters ?? {}],
};

export function useTeacherActivities(filters = {}) {
  return useQuery({ queryKey: activityKeys.list(filters), queryFn: () => activitiesApi.list(filters), refetchOnMount: 'always' });
}

/** Las entregas del curso se reflejan al momento en sus actividades (por revisar, sin entregar). */
export function useActivitiesLive(courseId) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!courseId) return undefined;
    const socket = getSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: activityKeys.all });
    const subscribe = () => socket.emit('course:subscribe', { courseId: Number(courseId) });

    subscribe();
    socket.on('connect', subscribe); // las salas se pierden al reconectar
    socket.on('submission:updated', refresh);
    socket.on('activity:removed', refresh);
    return () => {
      socket.emit('course:unsubscribe', { courseId: Number(courseId) });
      socket.off('connect', subscribe);
      socket.off('submission:updated', refresh);
      socket.off('activity:removed', refresh);
    };
  }, [courseId, queryClient]);
}

/** Cualquier cambio de una actividad afecta listas, Inicio, la cola de revisión y el cuadro de notas (si suma una columna). */
function useActivityMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityKeys.all });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
      queryClient.invalidateQueries({ queryKey: ['gradebook'] });
    },
  });
}

export const useCreateActivity = () => useActivityMutation(({ courseId, ...input }) => activitiesApi.create(courseId, input));
export const useUpdateActivity = () => useActivityMutation(({ activityId, ...body }) => activitiesApi.update(activityId, body));
export const usePublishActivity = () => useActivityMutation(activitiesApi.publish);
export const useCloseActivity = () => useActivityMutation(activitiesApi.close);
export const useReopenActivity = () => useActivityMutation(activitiesApi.reopen);
export const useDeleteActivity = () => useActivityMutation(activitiesApi.remove);
