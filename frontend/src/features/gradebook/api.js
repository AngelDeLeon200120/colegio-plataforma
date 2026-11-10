import { api, apiDownload } from '@/lib/apiClient';

export const gradebookApi = {
  myCourses: () => api('/me/courses'),

  paymentStatus: (courseId, unitId) => api(`/courses/${courseId}/gradebook/payment-status?unitId=${unitId}`),

  getSheet: (courseId, unitId) => api(`/courses/${courseId}/gradebook${unitId ? `?unitId=${unitId}` : ''}`),

  saveCells: (courseId, { unitId, cells }) =>
    api(`/courses/${courseId}/gradebook/scores`, { method: 'PUT', body: { unitId, cells } }),

  createItem: (courseId, body) => api(`/courses/${courseId}/grade-items`, { method: 'POST', body }),
  updateItem: (itemId, body) => api(`/grade-items/${itemId}`, { method: 'PATCH', body }),
  deleteItem: (itemId, { force = false } = {}) => api(`/grade-items/${itemId}?force=${force}`, { method: 'DELETE' }),

  downloadTemplate: (courseId, unitId, format) =>
    apiDownload(`/courses/${courseId}/gradebook/template?unitId=${unitId}&format=${format}`),

  uploadImport(courseId, unitId, file) {
    const form = new FormData();
    form.append('unitId', String(unitId));
    form.append('file', file);
    return api(`/courses/${courseId}/gradebook/imports`, { method: 'POST', body: form });
  },

  applyImport: (importId) => api(`/grade-imports/${importId}/apply`, { method: 'POST' }),
  discardImport: (importId) => api(`/grade-imports/${importId}/discard`, { method: 'POST' }),
};
