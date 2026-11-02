import { api } from '@/lib/apiClient';

const useMocks = import.meta.env.VITE_USE_MOCKS === 'true';
const mocks = () => import('./mocks.js');

export const authApi = {
  async login(credentials) {
    if (useMocks) return (await mocks()).login(credentials);
    return api('/auth/login', { method: 'POST', body: credentials, retry: false });
  },

  async logout() {
    if (useMocks) return (await mocks()).logout();
    return api('/auth/logout', { method: 'POST', retry: false });
  },

  async logoutAll() {
    if (useMocks) return (await mocks()).logout();
    return api('/auth/logout-all', { method: 'POST' });
  },
};
