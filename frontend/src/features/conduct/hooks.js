import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';
import { getSocket } from '@/lib/socket';

const query = (params) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  return search.toString() ? `?${search}` : '';
};

export const conductApi = {
  students: (params = {}) => api(`/conduct/students${query(params)}`),
  reports: (params = {}) => api(`/conduct/reports${query(params)}`),
  create: (body) => api('/conduct/reports', { method: 'POST', body }),
  void: (reportId, reason) => api(`/conduct/reports/${reportId}/void`, { method: 'POST', body: { reason } }),
  followups: (params = {}) => api(`/conduct/followups${query(params)}`),
  updateFollowup: (followupId, body) => api(`/conduct/followups/${followupId}`, { method: 'PATCH', body }),
  family: (studentId) => api(`/me/conduct?studentId=${studentId}`),
};

export const conductKeys = { all: ['conduct'] };

/** Un reporte nuevo, anulado o un seguimiento actualizado refresca las pantallas abiertas. */
export function useConductLive() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: conductKeys.all });
    socket.on('conduct:changed', refresh);
    return () => socket.off('conduct:changed', refresh);
  }, [queryClient]);
}

export const useConductStudents = (params) => useQuery({ queryKey: ['conduct', 'students', params], queryFn: () => conductApi.students(params) });
export const useConductReports = (params) => useQuery({ queryKey: ['conduct', 'reports', params], queryFn: () => conductApi.reports(params) });
export const useFollowups = (params) => useQuery({ queryKey: ['conduct', 'followups', params], queryFn: () => conductApi.followups(params) });
export const useFamilyConduct = (studentId) =>
  useQuery({ queryKey: ['conduct', 'family', String(studentId)], queryFn: () => conductApi.family(studentId), enabled: Boolean(studentId) });

function useConductMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: conductKeys.all }) });
}

export const useCreateReport = () => useConductMutation(conductApi.create);
export const useVoidReport = () => useConductMutation(({ reportId, reason }) => conductApi.void(reportId, reason));
export const useUpdateFollowup = () => useConductMutation(({ followupId, ...body }) => conductApi.updateFollowup(followupId, body));
