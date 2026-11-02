import { api, apiUpload } from '@/lib/apiClient';

const query = (studentId) => (studentId ? `?studentId=${studentId}` : '');

export const homeworkApi = {
  list: (studentId) => api(`/me/activities${query(studentId)}`),
  detail: (activityId, studentId) => api(`/me/activities/${activityId}${query(studentId)}`),

  submit(activityId, { files, comment }, onProgress) {
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    if (comment) form.append('comment', comment);
    return apiUpload(`/me/activities/${activityId}/attempts`, form, { onProgress });
  },
};
