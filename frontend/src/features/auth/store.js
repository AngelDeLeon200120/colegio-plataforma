import { create } from 'zustand';

// El access token vive solo en memoria; el refresh token en cookie httpOnly.
// status: 'loading' hasta que se intenta recuperar la sesión al abrir la app.
export const useAuthStore = create((set) => ({
  status: 'loading',
  accessToken: null,
  user: null,
  setSession: ({ accessToken, user }) => set((state) => ({ accessToken, user: user ?? state.user, status: 'authenticated' })),
  clear: () => set({ accessToken: null, user: null, status: 'anonymous' }),
}));
