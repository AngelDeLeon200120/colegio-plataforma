import { api } from '@/lib/apiClient';

export const messagesApi = {
  list: ({ topic, reason } = {}) => {
    const params = new URLSearchParams();
    if (topic) params.set('topic', topic);
    if (reason) params.set('reason', reason);
    const query = params.toString();
    return api(`/messages/threads${query ? `?${query}` : ''}`);
  },
  get: (threadId) => api(`/messages/threads/${threadId}`),
  unreadCount: () => api('/messages/unread-count'),
  recipients: () => api('/messages/recipients'),
  create: (body) => api('/messages/threads', { method: 'POST', body }),
  reply: (threadId, body) => api(`/messages/threads/${threadId}/messages`, { method: 'POST', body: { body } }),
};
