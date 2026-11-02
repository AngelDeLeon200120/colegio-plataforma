import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useOpenNotification } from './hooks';
import { NotificationIcon } from './NotificationItem';
import { useNotificationStore } from './store';

// Lo urgente se queda hasta que se cierre; lo demás se va solo
const DURATION_MS = { LOW: 5000, NORMAL: 6000, HIGH: 9000 };

function Toast({ notification }) {
  const dismiss = useNotificationStore((state) => state.dismissToast);
  const openNotification = useOpenNotification();
  const duration = DURATION_MS[notification.priority];

  useEffect(() => {
    if (!duration) return undefined;
    const timer = setTimeout(() => dismiss(notification.id), duration);
    return () => clearTimeout(timer);
  }, [notification.id, duration, dismiss]);

  return (
    <div
      role={notification.priority === 'URGENT' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full gap-3 rounded-xl border bg-white p-3 shadow-lg',
        notification.priority === 'URGENT' ? 'border-red-200' : 'border-zinc-200',
      )}
    >
      <NotificationIcon type={notification.type} />
      <button
        type="button"
        onClick={() => {
          dismiss(notification.id);
          openNotification(notification);
        }}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block text-sm font-semibold text-zinc-900">{notification.title}</span>
        {notification.body && <span className="mt-0.5 line-clamp-2 block text-sm text-zinc-500">{notification.body}</span>}
      </button>
      <button
        type="button"
        onClick={() => dismiss(notification.id)}
        aria-label="Cerrar aviso"
        className="-mt-1 -mr-1 h-fit rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Avisos emergentes de notificaciones recibidas en vivo (abajo a la derecha). */
export function NotificationToasts() {
  const toasts = useNotificationStore((state) => state.toasts);
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((notification) => (
        <Toast key={notification.id} notification={notification} />
      ))}
    </div>
  );
}
