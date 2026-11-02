import { io } from 'socket.io-client';
import { useAuthStore } from '@/features/auth/store';
import { refreshSession } from '@/features/auth/session';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL || undefined, {
      autoConnect: false,
      transports: ['websocket'],
      // Función: se reevalúa en cada reconexión, así toma el token renovado
      auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
    });

    socket.on('connect_error', async (err) => {
      const code = err.data?.code;
      if (code === 'TOKEN_EXPIRED' && (await refreshSession())) socket.connect();
      else if (code === 'SESSION_REVOKED') useAuthStore.getState().clear();
    });

    // "Cerrar todas las sesiones" desde otro dispositivo
    socket.on('session:revoked', () => useAuthStore.getState().clear());
  }
  if (!socket.connected) socket.connect();
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
}
