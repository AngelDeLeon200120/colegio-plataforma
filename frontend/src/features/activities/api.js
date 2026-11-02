import { api } from '@/lib/apiClient';

export const activitiesApi = {
  list: ({ courseId, status } = {}) => {
    const params = new URLSearchParams();
    if (courseId) params.set('courseId', courseId);
    if (status) params.set('status', status);
    const query = params.toString();
    return api(`/teacher/activities${query ? `?${query}` : ''}`);
  },

  /** Multipart: campos + material de apoyo. `publish` la publica al crearla. */
  create(courseId, { files = [], ...fields }) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== '') form.append(key, String(value));
    }
    files.forEach((file) => form.append('files', file));
    return api(`/courses/${courseId}/activities`, { method: 'POST', body: form });
  },

  update: (activityId, body) => api(`/activities/${activityId}`, { method: 'PATCH', body }),
  publish: (activityId) => api(`/activities/${activityId}/publish`, { method: 'POST' }),
  close: (activityId) => api(`/activities/${activityId}/close`, { method: 'POST' }),
  remove: (activityId) => api(`/activities/${activityId}`, { method: 'DELETE' }),
};
