import { api } from '@/lib/apiClient';

const useMocks = import.meta.env.VITE_USE_MOCKS === 'true';
// Import dinámico: los mocks no entran al bundle de producción
const mocks = () => import('./mocks.js');

export const submissionsApi = {
  async listForActivity(activityId) {
    if (useMocks) return (await mocks()).listForActivity(Number(activityId));
    return api(`/activities/${activityId}/submissions`);
  },

  async getDetail(submissionId) {
    if (useMocks) return (await mocks()).getDetail(submissionId);
    return api(`/submissions/${submissionId}`);
  },

  async approve(submissionId, { score, feedback, version }) {
    const body = { score, feedback, version };
    if (useMocks) return (await mocks()).approve(submissionId, body);
    return api(`/submissions/${submissionId}/approve`, { method: 'POST', body });
  },

  async reject(submissionId, { feedback, version }) {
    const body = { feedback, version };
    if (useMocks) return (await mocks()).reject(submissionId, body);
    return api(`/submissions/${submissionId}/reject`, { method: 'POST', body });
  },
};

export const isUsingMocks = useMocks;
