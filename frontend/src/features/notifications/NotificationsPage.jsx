import { useState } from 'react';
import { AlertTriangle, BellOff, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useMarkRead, useNotificationPages, useOpenNotification } from './hooks';
import { NotificationItem } from './NotificationItem';
import { useNotificationStore } from './store';

const TABS = [
  { value: false, label: 'Todas' },
  { value: true, label: 'Sin leer' },
];

export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotificationPages(unreadOnly);
  const markRead = useMarkRead();
  const openNotification = useOpenNotification();

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-normal text-zinc-900">Notificaciones</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {unreadCount ? `${unreadCount} sin leer` : 'Estás al día'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Filtro" className="flex flex-wrap gap-1.5">
            {TABS.map((tab) => (
              <button
                key={tab.label}
                type="button"
                role="tab"
                aria-selected={unreadOnly === tab.value}
                onClick={() => setUnreadOnly(tab.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  unreadOnly === tab.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <Button size="sm" onClick={() => markRead('all').catch(() => {})}>
              <CheckCheck className="size-3.5" /> Marcar todo como leído
            </Button>
          )}
        </div>
      </header>

      <div className="mt-6">
        {isError && (
          <p className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="size-4" /> {error.message}
          </p>
        )}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        )}
        {data && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <BellOff className="size-8 text-zinc-300" />
            <p className="text-sm text-zinc-500">{unreadOnly ? 'No tienes notificaciones sin leer.' : 'Todavía no tienes notificaciones.'}</p>
          </div>
        )}
        {items.length > 0 && (
          <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
            {items.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} onOpen={openNotification} />
            ))}
          </div>
        )}
        {hasNextPage && (
          <div className="mt-4 flex justify-center">
            <Button onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
              Cargar más
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
