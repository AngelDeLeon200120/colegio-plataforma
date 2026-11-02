import { useCallback, useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useAuthStore } from '@/features/auth/store';
import { getSocket } from '@/lib/socket';
import { notificationsApi } from './api';
import { useNotificationStore } from './store';

export const notificationKeys = {
  all: ['notifications'],
  list: (unread) => ['notifications', 'list', unread ? 'unread' : 'all'],
};

/**
 * Se monta una vez en el AppShell: carga el contador y las recientes, y escucha
 * el socket. Al reconectar vuelve a pedirlas, así no se pierde lo que llegó sin conexión.
 */
export function useNotificationsLive() {
  const userId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();

  useEffect(() => {
    // En modo de datos de ejemplo no hay backend al que conectarse
    if (!userId || import.meta.env.VITE_USE_MOCKS === 'true') return undefined;
    const store = useNotificationStore.getState;

    const refresh = () =>
      notificationsApi
        .list({ limit: 15 })
        .then((page) => store().load(page))
        .catch(() => {});

    const onNew = ({ data }) => {
      store().receive(data.notification);
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    };
    const onRead = ({ data }) => {
      store().markRead(data.ids);
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    };
    const onCount = ({ data }) => store().setUnreadCount(data.count);

    const socket = getSocket();
    refresh();
    socket.on('connect', refresh);
    socket.on('notification:new', onNew);
    socket.on('notification:read', onRead);
    socket.on('notification:unread_count', onCount);

    return () => {
      socket.off('connect', refresh);
      socket.off('notification:new', onNew);
      socket.off('notification:read', onRead);
      socket.off('notification:unread_count', onCount);
      store().reset();
    };
  }, [userId, queryClient]);
}

export function useNotificationPages(unread) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(unread),
    queryFn: ({ pageParam }) => notificationsApi.list({ cursor: pageParam, unread }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** Marcar leídas con respuesta inmediata en la UI; el servidor confirma el contador. */
export function useMarkRead() {
  const queryClient = useQueryClient();

  const markRead = useCallback(
    async (ids) => {
      const { markRead: markLocal, setUnreadCount, unreadCount } = useNotificationStore.getState();
      markLocal(ids);
      setUnreadCount(ids === 'all' ? 0 : Math.max(unreadCount - ids.length, 0));
      try {
        const result = ids === 'all' ? await notificationsApi.markAllRead() : await notificationsApi.markRead(ids);
        setUnreadCount(result.unreadCount);
      } finally {
        queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      }
    },
    [queryClient],
  );

  return markRead;
}

/** Abrir una notificación: la marca leída y lleva a su enlace. */
export function useOpenNotification() {
  const navigate = useNavigate();
  const markRead = useMarkRead();

  return useCallback(
    (notification) => {
      if (!notification.readAt) markRead([notification.id]).catch(() => {});
      if (notification.actionUrl) navigate(notification.actionUrl);
    },
    [markRead, navigate],
  );
}
