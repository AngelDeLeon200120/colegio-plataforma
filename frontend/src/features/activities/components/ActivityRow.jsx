import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ClipboardList, MoreHorizontal, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { useCloseActivity, usePublishActivity, useReopenActivity } from '../hooks';
import { DeleteActivityDialog } from './DeleteActivityDialog';

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
    <div className="flex items-center gap-2" title={title}>
      <div className="flex h-1.5 w-24 sm:w-36 overflow-hidden rounded-full bg-zinc-100" role="img" aria-label={title}>
        {segments.map((segment) => (
          <div key={segment.key} className={segment.className} style={{ width: `${(progress[segment.key] / progress.total) * 100}%` }} />
        ))}
      </div>
      <p className="text-xs whitespace-nowrap text-zinc-500 tabular-nums">
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
  const [deleting, setDeleting] = useState(false);
  const reopen = useReopenActivity();
  const error = publish.error ?? close.error ?? reopen.error;

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
          <button type="button" role="menuitem" className={cn(item, 'text-red-600')} onClick={() => (setOpen(false), setDeleting(true))}>
            {activity.status === 'DRAFT' ? 'Eliminar borrador' : 'Eliminar actividad'}
          </button>
          {error && <p className="px-2.5 py-1.5 text-xs text-red-600">{error.message}</p>}
        </div>
      )}
      {deleting && <DeleteActivityDialog activity={activity} onClose={() => setDeleting(false)} />}
    </div>
  );
}

/** Todo el cuadro de una actividad publicada o cerrada abre sus entregas (menos el menú de acciones). */
export function ActivityRow({ activity, onEdit }) {
  const scheduled = isScheduled(activity);
  const status = STATUS[scheduled ? 'SCHEDULED' : activity.status];
  const toReview = activity.progress.submitted;
  const reviewPath = activity.status === 'DRAFT' ? null : `/activities/${activity.id}/review`;

  const missing = activity.progress.pending;
  const badges = (toReview > 0 || missing > 0) && (
    <>
      {toReview > 0 && (
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-blue-700 tabular-nums">{toReview} por revisar</span>
      )}
      {missing > 0 && (
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-zinc-600 tabular-nums">{missing} sin entregar</span>
      )}
    </>
  );

  return (
    <li
      data-activity-id={activity.id}
      className={cn(
        'relative flex items-center gap-x-3 px-4 py-3 sm:gap-x-4 first:rounded-t-lg last:rounded-b-lg',
        reviewPath && 'transition-colors hover:bg-zinc-50 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-brand-600',
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: activity.course.color ?? "#1a73e8" }} aria-hidden>
        <ClipboardList className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-zinc-900">
            {reviewPath ? (
              <Link to={reviewPath} className="after:absolute after:inset-0 focus:outline-none">
                {activity.title}
              </Link>
            ) : (
              activity.title
            )}
          </p>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        {(reviewPath || activity.resourceCount > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            {reviewPath && (
              // Por encima del enlace del cuadro para conservar el detalle al pasar el cursor
              <Link to={reviewPath} tabIndex={-1} className="relative">
                <ProgressBar progress={activity.progress} />
              </Link>
            )}
            {activity.resourceCount > 0 && (
              <span className="inline-flex items-center gap-0.5" title="Material de apoyo">
                <Paperclip className="size-3" /> {activity.resourceCount}
              </span>
            )}
            {/* En el teléfono va aquí; en pantallas anchas, a la derecha */}
            {badges && <span className="flex flex-wrap gap-1 sm:hidden">{badges}</span>}
          </div>
        )}
        <p className="mt-1 text-xs text-zinc-500">
          {scheduled
            ? `Se publica el ${formatDateTime(activity.publishAt)}`
            : activity.dueAt
              ? `Vence ${formatDateTime(activity.dueAt)}`
              : 'Sin fecha de entrega'}
        </p>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {badges && <span className="flex gap-1 max-sm:hidden">{badges}</span>}
        <ActionsMenu activity={activity} onEdit={onEdit} />
      </div>
    </li>
  );
}
