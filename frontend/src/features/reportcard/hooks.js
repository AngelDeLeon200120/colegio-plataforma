import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/apiClient';

/** Boleta del estudiante (o de un hijo, para la familia) en una unidad; sin unidad, la actual. */
export function useReportCard(studentId, unitId, enabled = true) {
  const params = new URLSearchParams();
  if (studentId) params.set('studentId', studentId);
  if (unitId) params.set('unitId', unitId);
  return useQuery({
    queryKey: ['report-card', studentId ?? 'me', unitId ?? 'current'],
    queryFn: () => api(`/me/report-card${params.toString() ? `?${params}` : ''}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}
