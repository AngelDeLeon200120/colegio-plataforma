import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { getSocket } from '@/lib/socket';
import { messagesApi } from './api';

const usingMocks = import.meta.env.VITE_USE_MOCKS === 'true';

export const messageKeys = {
  all: ['messages'],
  list: (filter) => ['messages', 'list', filter],
  thread: (threadId) => ['messages', 'thread', String(threadId)],
  unread: ['messages', 'unread'],
  recipients: ['messages', 'recipients'],
};

/** Se monta una vez en el AppShell: un mensaje nuevo o leído (aquí o en otro dispositivo) refresca bandeja y contador. */
export function useMessagesLive() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || usingMocks) return undefined;
    const onNew = () => queryClient.invalidateQueries({ queryKey: messageKeys.all });
    // Leer no cambia el hilo: solo bandeja y contador (si recargara el hilo, se volvería a marcar leído sin fin)
    const onRead = () => {
      queryClient.invalidateQueries({ queryKey: ['messages', 'list'] });
      queryClient.invalidateQueries({ queryKey: messageKeys.unread });
    };
    const socket = getSocket();
    socket.on('message:new', onNew);
    socket.on('message:read', onRead);
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:read', onRead);
    };
  }, [userId, queryClient]);
}

export function useUnreadMessages() {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: messageKeys.unread,
    queryFn: messagesApi.unreadCount,
    enabled: Boolean(userId) && !usingMocks,
    select: (data) => data.count,
  });
}

export function useThreads(filter) {
  return useQuery({ queryKey: messageKeys.list(filter), queryFn: () => messagesApi.list(filter) });
}

export function useThread(threadId) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: messageKeys.thread(threadId),
    enabled: Boolean(threadId),
    queryFn: async () => {
      const data = await messagesApi.get(threadId);
      // Abrir el hilo lo marca leído: bandeja y contador se ponen al día
      queryClient.invalidateQueries({ queryKey: ['messages', 'list'] });
      queryClient.invalidateQueries({ queryKey: messageKeys.unread });
      return data;
    },
  });
}

export function useRecipients(enabled) {
  return useQuery({ queryKey: messageKeys.recipients, queryFn: messagesApi.recipients, enabled, staleTime: 5 * 60_000 });
}

export function useCreateThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: messagesApi.create,
    onSuccess: (data) => {
      queryClient.setQueryData(messageKeys.thread(data.thread.id), data);
      queryClient.invalidateQueries({ queryKey: ['messages', 'list'] });
    },
  });
}

export function useReply(threadId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => messagesApi.reply(threadId, body),
    onSuccess: (message) => {
      queryClient.setQueryData(messageKeys.thread(threadId), (data) => data && { ...data, messages: [...data.messages, message] });
      queryClient.invalidateQueries({ queryKey: ['messages', 'list'] });
    },
  });
}
