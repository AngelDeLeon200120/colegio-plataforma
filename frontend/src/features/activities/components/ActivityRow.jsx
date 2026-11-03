import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ClipboardList, Lock, MoreHorizontal, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { ACTIVITY_TYPES } from '@/features/homework/model';
import { useCloseActivity, useDeleteActivity, usePublishActivity, useReopenActivity } from '../hooks';

export const STATUS = {
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  PUBLISHED: { label: 'Publicada', tone: 'green' },
  CLOSED: { label: 'Cerrada', tone: 'neutral' },
  SCHEDULED: { label: 'Programada', tone: 'blue' },
};

const isScheduled = (activity) => activity.status === 'PUBLISHED' && activity.publishAt && new Date(activity.publishAt) > new Date();

/** Barra de avance: aprobadas, por revisar, en corrección y sin entregar. */
export function ProgressBar({ progress }) {
  if (!progress.total) return <span className="text-xs text-zinc-400">Sin entregas</span>;
  const segments = [
    { key: 'approved', className: 'bg-emerald-500', label: 'aprobadas' },
    { key: 'submitted', className: 'bg-blue-500', label: 'por revisar' },
    { key: 'rejected', className: 'bg-amber-400', label: 'en corrección' },
    { key: 'pending', className: 'bg-zinc-200', label: 'sin entregar' },
  ];
  const title = segments.map((segment) => `${progress[segment.key]} ${segment.label}`).join(' · ');
  return (
    <div className="w-36" title={title}>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-zinc-100" role="img" aria-label={title}>
        {segments.map((segment) => (
          <div key={segment.key} className={segment.className} style={{ width: `${(progress[segment.key] / progress.total) * 100}%` }} />
        ))}
      </div>
      <p className="mt-1 text-xs text-zinc-500 tabular-nums">
        {progress.approved}/{progress.total} aprobadas
      </p>
    </div>
  );
}

function ActionsMenu({ activity, onEdit }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const ref = useRef(null);
  const publish = usePublishActivity();
  const close = useCloseActivity();
  const remove = useDeleteActivity();
  const reopen = useReopenActivity();
  const error = publish.error ?? close.error ?? reopen.error ?? remove.error;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!ref.current?.contains(event.target)) {
        setOpen(false);
        setConfirm(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Acciones con efecto para los estudiantes piden un segundo clic
  const run = (key, mutation) => {
    if (confirm !== key) return setConfirm(key);
    mutation.mutate(activity.id, { onSuccess: () => setOpen(false), onSettled: () => setConfirm(null) });
  };

  const item = 'block w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-zinc-100';

  return (
    <div ref={ref} className="relative">
      <Button size="icon" variant="ghost" onClick={() => setOpen((value) => !value)} aria-label="Más acciones" aria-expanded={open}>
        <MoreHorizontal className="size-4" />
      </Button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-20 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg">
          <button type="button" role="menuitem" className={item} onClick={() => (setOpen(false), onEdit(activity))}>
            Editar
          </button>
          {activity.status === 'DRAFT' && (
            <button type="button" role="menuitem" className={cn(item, 'font-medium text-emerald-700')} onClick={() => run('publish', publish)}>
              {confirm === 'publish' ? 'Confirmar: avisar a la sección' : 'Publicar'}
            </button>
          )}
          {activity.status === 'PUBLISHED' && (
            <button type="button" role="menuitem" className={item} onClick={() => run('close', close)}>
              {confirm === 'close' ? 'Confirmar: ya no recibirá entregas' : 'Cerrar entregas'}
            </button>
          )}
          {activity.status === 'CLOSED' && (
            <button type="button" role="menuitem" className={item} onClick={() => run('reopen', reopen)}>
              {confirm === 'reopen' ? 'Confirmar: vuelve a recibir entregas' : 'Reabrir entregas'}
            </button>
          )}
          {(activity.status === 'DRAFT' || activity.status === 'CLOSED') && (
            <button type="button" role="menuitem" className={cn(item, 'text-red-600')} onClick={() => run('remove', remove)}>
              {confirm === 'remove'
                ? activity.status === 'CLOSED'
                  ? 'Confirmar: deja de verse para todos'
                  : 'Confirmar eliminación'
                : activity.status === 'CLOSED'
                  ? 'Eliminar actividad'
                  : 'Eliminar borrador'}
            </button>
          )}
          {error && <p className="px-2.5 py-1.5 text-xs text-red-600">{error.message}</p>}
        </div>
      )}
    </div>
  );
}

export function ActivityRow({ activity, onEdit }) {
  const scheduled = isScheduled(activity);
  const status = STATUS[scheduled ? 'SCHEDULED' : activity.status];
  const toReview = activity.progress.submitted;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: activity.course.color ?? "#1a73e8" }} aria-hidden>
        <ClipboardList className="size-5" />
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-900">{activity.title}</p>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
          <span>{activity.course.name}</span>·<span>{ACTIVITY_TYPES[activity.type]}</span>·
          <span className="inline-flex items-center gap-1">
            {activity.unit.status === 'CLOSED' && <Lock className="size-3" />}
            {activity.unit.name}
          </span>
          {activity.resourceCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              · <Paperclip className="size-3" /> {activity.resourceCount}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {scheduled
            ? `Se publica el ${formatDateTime(activity.publishAt)}`
            : activity.dueAt
              ? `Vence ${formatDateTime(activity.dueAt)}`
              : 'Sin fecha de entrega'}
        </p>
      </div>

      {activity.status !== 'DRAFT' && <ProgressBar progress={activity.progress} />}

      <div className="ml-auto flex items-center gap-1">
        {activity.status !== 'DRAFT' && (
          <Link
            to={`/activities/${activity.id}/review`}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors',
              toReview ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-zinc-300 bg-white text-brand-700 hover:bg-brand-50',
            )}
          >
            {toReview ? `Revisar (${toReview})` : 'Ver entregas'}
          </Link>
        )}
        <ActionsMenu activity={activity} onEdit={onEdit} />
      </div>
    </li>
  );
}
