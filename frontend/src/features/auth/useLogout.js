import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { disconnectSocket } from '@/lib/socket';
import { authApi } from './api';
import { useAuthStore } from './store';

/** Cierra la sesión local aunque la API no responda: el usuario quiere salir. */
export function useLogout() {
  const queryClient = useQueryClient();

  return useCallback(
    async ({ everywhere = false } = {}) => {
      try {
        await (everywhere ? authApi.logoutAll() : authApi.logout());
      } finally {
        disconnectSocket();
        queryClient.clear(); // nada del usuario anterior queda en caché
        useAuthStore.getState().clear();
      }
    },
    [queryClient],
  );
}
