import { api } from '@/lib/apiClient';

export const feedApi = {
  list: ({ cursor } = {}) => api(`/feed/posts${cursor ? `?cursor=${cursor}` : ''}`),
  create({ body, isPinned, image }) {
    const form = new FormData();
    form.append('body', body);
    form.append('isPinned', String(Boolean(isPinned)));
    if (image) form.append('image', image);
    return api('/feed/posts', { method: 'POST', body: form });
  },
  update: (postId, body) => api(`/feed/posts/${postId}`, { method: 'PATCH', body }),
  remove: (postId) => api(`/feed/posts/${postId}`, { method: 'DELETE' }),
  react: (postId, on) => api(`/feed/posts/${postId}/reaction`, { method: 'PUT', body: { on } }),
  comments: (postId) => api(`/feed/posts/${postId}/comments`),
  comment: (postId, body) => api(`/feed/posts/${postId}/comments`, { method: 'POST', body: { body } }),
  removeComment: (commentId) => api(`/feed/comments/${commentId}`, { method: 'DELETE' }),
};
