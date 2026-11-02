import { api } from '@/lib/apiClient';

export const notificationsApi = {
  list: ({ cursor, unread = false, limit = 20 } = {}) =>
    api(`/notifications?limit=${limit}&unread=${unread}${cursor ? `&cursor=${cursor}` : ''}`),
  unreadCount: () => api('/notifications/unread-count'),
  markRead: (ids) => api('/notifications/read', { method: 'POST', body: { ids } }),
  markAllRead: () => api('/notifications/read-all', { method: 'POST' }),
};
