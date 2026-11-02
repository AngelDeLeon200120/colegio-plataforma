import { api } from '@/lib/apiClient';

const qs = (params) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== '' && value !== null));
  return search.toString() ? `?${search}` : '';
};

export const adminApi = {
  users: (params = {}) => api(`/admin/users${qs(params)}`),
  createUser: (body) => api('/admin/users', { method: 'POST', body }),
  updateUser: (id, body) => api(`/admin/users/${id}`, { method: 'PATCH', body }),
  resetPassword: (id) => api(`/admin/users/${id}/reset-password`, { method: 'POST' }),

  students: (params = {}) => api(`/admin/students${qs(params)}`),
  createStudent: (body) => api('/admin/students', { method: 'POST', body }),
  updateStudent: (id, body) => api(`/admin/students/${id}`, { method: 'PATCH', body }),
  createStudentAccount: (id, email) => api(`/admin/students/${id}/account`, { method: 'POST', body: { email } }),
  setEnrollment: (id, sectionId) => api(`/admin/students/${id}/enrollment`, { method: 'PUT', body: { sectionId } }),
  linkGuardian: (id, body) => api(`/admin/students/${id}/guardians`, { method: 'POST', body }),
  unlinkGuardian: (id, guardianId) => api(`/admin/students/${id}/guardians/${guardianId}`, { method: 'DELETE' }),

  academic: () => api('/admin/academic'),
  createUnit: (body) => api('/admin/academic/units', { method: 'POST', body }),
  unitAction: (id, action) => api(`/admin/academic/units/${id}/${action}`, { method: 'POST' }),
  createGradeLevel: (body) => api('/admin/academic/grade-levels', { method: 'POST', body }),
  createSection: (body) => api('/admin/academic/sections', { method: 'POST', body }),
  createSubject: (body) => api('/admin/academic/subjects', { method: 'POST', body }),
  createCourse: (body) => api('/admin/academic/courses', { method: 'POST', body }),
  updateCourse: (id, body) => api(`/admin/academic/courses/${id}`, { method: 'PATCH', body }),

  changeOwnPassword: (body) => api('/auth/me/password', { method: 'PATCH', body }),
};
