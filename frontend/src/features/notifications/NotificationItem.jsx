import {
  AlertOctagon,
  Bell,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock,
  Inbox,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';

const LOOK = {
  SUBMISSION_RECEIVED: { icon: Inbox, className: 'bg-blue-50 text-blue-600' },
  SUBMISSION_APPROVED: { icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600' },
  SUBMISSION_REJECTED: { icon: RotateCcw, className: 'bg-amber-50 text-amber-600' },
  CORRECTION_PENDING: { icon: BellRing, className: 'bg-amber-50 text-amber-600' },
  ACTIVITY_OVERDUE: { icon: Clock, className: 'bg-red-50 text-red-600' },
  ACTIVITY_MISSED: { icon: AlertOctagon, className: 'bg-red-50 text-red-600' },
  ACTIVITY_DUE_SOON: { icon: CalendarClock, className: 'bg-violet-50 text-violet-600' },
};
const DEFAULT_LOOK = { icon: Bell, className: 'bg-zinc-100 text-zinc-500' };

export function NotificationIcon({ type, className }) {
  const look = LOOK[type] ?? DEFAULT_LOOK;
  return (
    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', look.className, className)}>
      <look.icon className="size-4" />
    </span>
  );
}

/** Fila de notificación: botón que la abre (y la marca leída). */
export function NotificationItem({ notification, onOpen, compact = false }) {
  const unread = !notification.readAt;
  const urgent = notification.priority === 'URGENT';

  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={cn(
        'flex w-full gap-3 text-left transition-colors hover:bg-zinc-50',
        compact ? 'px-3 py-2.5' : 'px-4 py-3',
        unread && 'bg-blue-50/40',
      )}
    >
      <NotificationIcon type={notification.type} />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm', unread ? 'font-semibold text-zinc-900' : 'text-zinc-700')}>
          {urgent && <span className="mr-1.5 rounded bg-red-100 px-1 py-px text-[10px] font-semibold text-red-700 uppercase">Urgente</span>}
          {notification.title}
        </span>
        {notification.body && (
          <span className={cn('mt-0.5 block text-sm text-zinc-500', compact ? 'line-clamp-2' : 'line-clamp-3')}>{notification.body}</span>
        )}
        <span className="mt-1 block text-xs text-zinc-400">
          {formatRelative(notification.createdAt)}
          {notification.studentName && ` · ${notification.studentName}`}
        </span>
      </span>
      {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500" aria-label="Sin leer" />}
    </button>
  );
}
