import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Bell, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useMarkRead, useOpenNotification } from './hooks';
import { NotificationItem } from './NotificationItem';
import { useNotificationStore } from './store';

const badgeText = (count) => (count > 99 ? '99+' : String(count));

/** Campana con contador y panel de las notificaciones recientes. */
export function NotificationBell({ align = 'left' }) {
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const recent = useNotificationStore((state) => state.recent);
  const loaded = useNotificationStore((state) => state.loaded);
  const markRead = useMarkRead();
  const openNotification = useOpenNotification();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => !containerRef.current?.contains(event.target) && setOpen(false);
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const onOpen = (notification) => {
    setOpen(false);
    openNotification(notification);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unreadCount ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
        className={cn(
          'relative flex size-8 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900',
          open && 'bg-zinc-100 text-zinc-900',
        )}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-white">
            {badgeText(unreadCount)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificaciones recientes"
          className={cn(
            'absolute top-full z-50 mt-2 flex max-h-[min(32rem,80vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl',
            align === 'left' ? 'left-0' : 'right-0',
          )}
        >
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2.5">
            <p className="text-sm font-semibold text-zinc-900">Notificaciones</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markRead('all').catch(() => {})}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                <CheckCheck className="size-3.5" /> Marcar todo como leído
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 divide-y divide-zinc-100 overflow-y-auto">
            {!loaded && <p className="px-3 py-8 text-center text-sm text-zinc-400">Cargando…</p>}
            {loaded && recent.length === 0 && (
              <p className="px-3 py-10 text-center text-sm text-zinc-500">No tienes notificaciones.</p>
            )}
            {recent.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} onOpen={onOpen} compact />
            ))}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="border-t border-zinc-100 px-3 py-2.5 text-center text-sm font-medium text-blue-700 hover:bg-zinc-50"
          >
            Ver todas
          </Link>
        </div>
      )}
    </div>
  );
}
