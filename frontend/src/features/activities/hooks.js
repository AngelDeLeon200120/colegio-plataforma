import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { activitiesApi } from './api';

export const activityKeys = {
  all: ['teacher-activities'],
  list: (filters) => ['teacher-activities', filters ?? {}],
};

export function useTeacherActivities(filters = {}) {
  return useQuery({ queryKey: activityKeys.list(filters), queryFn: () => activitiesApi.list(filters) });
}

/** Cualquier cambio de una actividad afecta listas, Inicio y la cola de revisión. */
function useActivityMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityKeys.all });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    },
  });
}

export const useCreateActivity = () => useActivityMutation(({ courseId, ...input }) => activitiesApi.create(courseId, input));
export const useUpdateActivity = () => useActivityMutation(({ activityId, ...body }) => activitiesApi.update(activityId, body));
export const usePublishActivity = () => useActivityMutation(activitiesApi.publish);
export const useCloseActivity = () => useActivityMutation(activitiesApi.close);
export const useDeleteActivity = () => useActivityMutation(activitiesApi.remove);
