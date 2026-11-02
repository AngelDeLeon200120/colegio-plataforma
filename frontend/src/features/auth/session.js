import { useAuthStore } from './store';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const useMocks = import.meta.env.VITE_USE_MOCKS === 'true';

async function requestRefresh() {
  if (useMocks) return (await import('./mocks.js')).refresh();

  const res = await fetch(`${API_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error('refresh failed');
  return (await res.json()).data;
}

let refreshing = null;

/**
 * Renueva el access token con la cookie de refresh. Una sola petición en vuelo
 * aunque varias llamadas fallen a la vez (si no, la rotación las invalidaría).
 */
export function refreshSession() {
  refreshing ??= requestRefresh()
    .then((session) => {
      useAuthStore.getState().setSession(session);
      return true;
    })
    .catch(() => {
      useAuthStore.getState().clear();
      return false;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}
