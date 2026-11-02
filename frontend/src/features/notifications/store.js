import { create } from 'zustand';

const RECENT_LIMIT = 15;
const MAX_TOASTS = 3;

const markItems = (items, ids) => {
  const readAt = new Date().toISOString();
  return items.map((item) => (ids === 'all' || ids.includes(item.id) ? { ...item, readAt: item.readAt ?? readAt } : item));
};

/**
 * Estado en vivo de notificaciones: contador de la campana, las más recientes
 * (para el panel desplegable) y los avisos emergentes. La página completa
 * pagina con React Query.
 */
export const useNotificationStore = create((set) => ({
  unreadCount: 0,
  recent: [],
  loaded: false,
  toasts: [],

  load: ({ items, unreadCount }) => set({ recent: items.slice(0, RECENT_LIMIT), unreadCount, loaded: true }),

  receive: (notification) =>
    set((state) => {
      // Reconexiones o varias réplicas pueden repetir un evento
      if (state.recent.some((item) => item.id === notification.id)) return state;
      return {
        recent: [notification, ...state.recent].slice(0, RECENT_LIMIT),
        unreadCount: state.unreadCount + 1,
        toasts: [...state.toasts, notification].slice(-MAX_TOASTS),
      };
    }),

  markRead: (ids) => set((state) => ({ recent: markItems(state.recent, ids) })),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  reset: () => set({ unreadCount: 0, recent: [], loaded: false, toasts: [] }),
}));
