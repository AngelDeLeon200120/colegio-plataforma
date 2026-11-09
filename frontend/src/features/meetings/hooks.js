import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { getSocket } from '@/lib/socket';

export const meetingsApi = {
  list: ({ courseId } = {}) => api(`/meetings${courseId ? `?courseId=${courseId}` : ''}`),
  byCode: (code) => api(`/meetings/by-code/${encodeURIComponent(code.trim())}`),
  create: (courseId, body) => api(`/courses/${courseId}/meetings`, { method: 'POST', body }),
  update: (meetingId, body) => api(`/meetings/${meetingId}`, { method: 'PATCH', body }),
  cancel: (meetingId) => api(`/meetings/${meetingId}/cancel`, { method: 'POST' }),
};

export const meetingKeys = {
  all: ['meetings'],
  list: (courseId) => ['meetings', 'list', courseId ? String(courseId) : 'all'],
};

export function useMeetings(courseId) {
  return useQuery({ queryKey: meetingKeys.list(courseId), queryFn: () => meetingsApi.list({ courseId }) });
}

export function useMeetingsLive() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: meetingKeys.all });
    socket.on('meeting:changed', refresh);
    return () => socket.off('meeting:changed', refresh);
  }, [queryClient]);
}

function useMeetingMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: meetingKeys.all });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
}

export const useCreateMeeting = () => useMeetingMutation(({ courseId, ...body }) => meetingsApi.create(courseId, body));
export const useUpdateMeeting = () => useMeetingMutation(({ meetingId, ...body }) => meetingsApi.update(meetingId, body));
export const useCancelMeeting = () => useMeetingMutation(meetingsApi.cancel);
export const useFindByCode = () => useMutation({ mutationFn: meetingsApi.byCode });
