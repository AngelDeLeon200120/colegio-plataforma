import { useEffect } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { getSocket } from '@/lib/socket';

export const calendarApi = {
  agenda: ({ from, to }) => api(`/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  create: (body) => api('/calendar/events', { method: 'POST', body }),
  update: (eventId, body) => api(`/calendar/events/${eventId}`, { method: 'PATCH', body }),
  remove: (eventId) => api(`/calendar/events/${eventId}`, { method: 'DELETE' }),
};

export const calendarKeys = {
  all: ['calendar'],
  range: ({ from, to }) => ['calendar', from, to],
};

export function useAgenda(range) {
  return useQuery({ queryKey: calendarKeys.range(range), queryFn: () => calendarApi.agenda(range), placeholderData: keepPreviousData });
}

/** Un evento nuevo de la administración o una reunión programada refresca el calendario abierto. */
export function useCalendarLive() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: calendarKeys.all });
    socket.on('calendar:changed', refresh);
    socket.on('meeting:changed', refresh);
    return () => {
      socket.off('calendar:changed', refresh);
      socket.off('meeting:changed', refresh);
    };
  }, [queryClient]);
}

function useEventMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: calendarKeys.all }) });
}

export const useCreateEvent = () => useEventMutation(calendarApi.create);
export const useUpdateEvent = () => useEventMutation(({ eventId, ...body }) => calendarApi.update(eventId, body));
export const useDeleteEvent = () => useEventMutation(calendarApi.remove);
