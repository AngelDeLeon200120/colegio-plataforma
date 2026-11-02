import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import { isUsingMocks, submissionsApi } from './api';

export const submissionKeys = {
  list: (activityId) => ['activities', String(activityId), 'submissions'],
  detail: (submissionId) => ['submissions', String(submissionId)],
};

export function useActivitySubmissions(activityId) {
  return useQuery({
    queryKey: submissionKeys.list(activityId),
    queryFn: () => submissionsApi.listForActivity(activityId),
  });
}

export function useSubmissionDetail(submissionId) {
  return useQuery({
    queryKey: submissionKeys.detail(submissionId),
    queryFn: () => submissionsApi.getDetail(submissionId),
    enabled: Boolean(submissionId),
  });
}

/** Cambia el estado de un ítem en la caché de la lista y recalcula los contadores. */
function patchListItem(list, submissionId, patch) {
  if (!list) return list;
  const items = list.items.map((item) => (item.id === submissionId ? { ...item, ...patch } : item));
  const summary = { PENDING: 0, SUBMITTED: 0, REJECTED: 0, APPROVED: 0, total: items.length };
  for (const { status } of items) summary[status] += 1;
  return { ...list, items, summary };
}

/**
 * Aprobar / rechazar con actualización optimista de la lista.
 * Si la API responde 409 o 422 se revierte y se recargan los datos reales.
 */
export function useReviewSubmission(activityId) {
  const queryClient = useQueryClient();
  const listKey = submissionKeys.list(activityId);

  return useMutation({
    mutationFn: ({ submissionId, decision, ...input }) =>
      decision === 'APPROVED' ? submissionsApi.approve(submissionId, input) : submissionsApi.reject(submissionId, input),

    onMutate: async ({ submissionId, decision, score }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData(listKey);
      queryClient.setQueryData(listKey, (list) =>
        patchListItem(list, submissionId, { status: decision, score: decision === 'APPROVED' ? score : null }),
      );
      return { previous };
    },

    onSuccess: (result) => {
      queryClient.setQueryData(listKey, (list) => patchListItem(list, result.id, { status: result.status, score: result.score, version: result.version }));
    },

    onError: (error, variables, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous);
    },

    onSettled: (result, error, { submissionId }) => {
      queryClient.invalidateQueries({ queryKey: submissionKeys.detail(submissionId) });
      if (error) queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}

/** Refresca la cola cuando otro profesor/admin o un alumno cambia una entrega. */
export function useSubmissionLiveUpdates(activityId, courseId) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isUsingMocks || !courseId) return undefined;

    const socket = getSocket();
    const subscribe = () => socket.emit('course:subscribe', { courseId });
    const onUpdated = ({ data }) => {
      if (String(data.activityId) !== String(activityId)) return;
      queryClient.invalidateQueries({ queryKey: submissionKeys.list(activityId) });
      queryClient.invalidateQueries({ queryKey: submissionKeys.detail(data.submissionId) });
    };

    subscribe();
    socket.on('connect', subscribe); // las salas se pierden al reconectar
    socket.on('submission:updated', onUpdated);

    return () => {
      socket.emit('course:unsubscribe', { courseId });
      socket.off('connect', subscribe);
      socket.off('submission:updated', onUpdated);
    };
  }, [activityId, courseId, queryClient]);
}
