import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { api, apiUpload } from '@/lib/apiClient';
import { getSocket } from '@/lib/socket';

export const staffChatApi = {
  messages: ({ before } = {}) => api(`/staff-chat/messages${before ? `?before=${before}` : ''}`),
  members: () => api('/staff-chat/members'),
  roster: () => api('/staff-chat/roster'),
  setMembership: (userId, included) => api(`/staff-chat/members/${userId}`, { method: 'PUT', body: { included } }),
  unread: () => api('/staff-chat/unread-count'),
  /** Solo texto: JSON como siempre. Con adjuntos: multipart con progreso de subida (0 a 1). */
  send({ body, files = [], onProgress }) {
    if (!files.length) return api('/staff-chat/messages', { method: 'POST', body: { body } });
    const form = new FormData();
    if (body) form.append('body', body);
    files.forEach((file) => form.append('files', file));
    return apiUpload('/staff-chat/messages', form, { onProgress });
  },
  remove: (messageId) => api(`/staff-chat/messages/${messageId}`, { method: 'DELETE' }),
  read: (messageId) => api('/staff-chat/read', { method: 'POST', body: { messageId } }),
};

export const staffChatKeys = {
  all: ['staff-chat'],
  messages: ['staff-chat', 'messages'],
  unread: ['staff-chat', 'unread'],
  members: ['staff-chat', 'members'],
  roster: ['staff-chat', 'roster'],
};

const isStaff = (role) => role === 'TEACHER' || role === 'ADMIN';

/** Contador del menú y si la persona está en la sala. Solo para el personal. */
export function useStaffChatUnread() {
  const role = useAuthStore((state) => state.user?.role);
  return useQuery({ queryKey: staffChatKeys.unread, queryFn: staffChatApi.unread, enabled: isStaff(role) });
}

/**
 * Se monta una vez en el AppShell: un mensaje nuevo entra a la conversación abierta
 * (sin recargar todo) y actualiza el contador.
 */
export function useStaffChatLive() {
  const role = useAuthStore((state) => state.user?.role);
  const myId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isStaff(role)) return undefined;
    const socket = getSocket();
    const onNew = ({ data }) => {
      queryClient.setQueryData(staffChatKeys.messages, (current) => {
        if (!current) return current;
        const pages = [...current.pages];
        const last = pages[pages.length - 1];
        if (last.messages.some((message) => message.id === data.message.id)) return current;
        pages[pages.length - 1] = { ...last, messages: [...last.messages, data.message] };
        return { ...current, pages };
      });
      if (data.message.author.id !== myId) queryClient.invalidateQueries({ queryKey: staffChatKeys.unread });
    };
    const onDeleted = ({ data }) => {
      queryClient.setQueryData(
        staffChatKeys.messages,
        (current) =>
          current && {
            ...current,
            pages: current.pages.map((page) => ({
              ...page,
              messages: page.messages.map((message) =>
                message.id === data.messageId ? { ...message, body: null, deleted: true } : message,
              ),
            })),
          },
      );
      queryClient.invalidateQueries({ queryKey: staffChatKeys.unread });
    };
    const onRead = () => queryClient.invalidateQueries({ queryKey: staffChatKeys.unread });
    // La administración me incluyó o me sacó: menú, sala y contador se actualizan
    const onMembership = () => queryClient.invalidateQueries({ queryKey: staffChatKeys.all });
    const onMembers = () => {
      queryClient.invalidateQueries({ queryKey: staffChatKeys.members });
      queryClient.invalidateQueries({ queryKey: staffChatKeys.roster });
    };
    socket.on('staffchat:new', onNew);
    socket.on('staffchat:deleted', onDeleted);
    socket.on('staffchat:read', onRead);
    socket.on('staffchat:membership', onMembership);
    socket.on('staffchat:members', onMembers);
    return () => {
      socket.off('staffchat:membership', onMembership);
      socket.off('staffchat:members', onMembers);
      socket.off('staffchat:new', onNew);
      socket.off('staffchat:deleted', onDeleted);
      socket.off('staffchat:read', onRead);
    };
  }, [role, myId, queryClient]);
}

/** Páginas de 50, de la más reciente hacia atrás. `pages` va de la más antigua a la más nueva. */
export function useStaffChatMessages() {
  return useInfiniteQuery({
    queryKey: staffChatKeys.messages,
    queryFn: ({ pageParam }) => staffChatApi.messages({ before: pageParam }),
    initialPageParam: undefined,
    getPreviousPageParam: (first) => (first.hasMore ? first.messages[0]?.id : undefined),
    getNextPageParam: () => undefined,
    staleTime: Infinity,
  });
}

export const useStaffChatRoster = (enabled) => useQuery({ queryKey: staffChatKeys.roster, queryFn: staffChatApi.roster, enabled });

export function useSetMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, included }) => staffChatApi.setMembership(userId, included),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffChatKeys.roster });
      queryClient.invalidateQueries({ queryKey: staffChatKeys.members });
    },
  });
}

export const useStaffChatMembers = () =>
  useQuery({ queryKey: staffChatKeys.members, queryFn: staffChatApi.members, staleTime: 5 * 60_000 });

export function useSendStaffMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: staffChatApi.send,
    onSuccess: (message) =>
      queryClient.setQueryData(staffChatKeys.messages, (current) => {
        if (!current) return current;
        const pages = [...current.pages];
        const last = pages[pages.length - 1];
        if (last.messages.some((item) => item.id === message.id)) return current;
        pages[pages.length - 1] = { ...last, messages: [...last.messages, message] };
        return { ...current, pages };
      }),
  });
}

export const useDeleteStaffMessage = () => useMutation({ mutationFn: staffChatApi.remove });

export function useMarkStaffChatRead() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: staffChatApi.read, onSuccess: (data) => queryClient.setQueryData(staffChatKeys.unread, data) });
}
