import { useState } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useDeleteActivity } from '../hooks';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** Confirmar la eliminación: dice qué se pierde, también en el cuadro de notas. */
export function DeleteActivityDialog({ activity, onClose }) {
  const remove = useDeleteActivity();
  // Si aparecieron notas después de cargar la lista, el servidor las avisa y se confirma de nuevo
  const [filled, setFilled] = useState(activity.gradeColumn?.filled ?? 0);
  const isDraft = activity.status === 'DRAFT';
  const delivered = activity.progress.total - activity.progress.pending;
  const unitClosed = activity.unit.status === 'CLOSED';

  const onDelete = () =>
    remove.mutate(
      { activityId: activity.id, force: filled > 0 },
      { onSuccess: onClose, onError: (error) => error.code === 'HAS_SCORES' && setFilled(error.details?.filled ?? 1) },
    );

  return (
    <Dialog
      open
      onClose={onClose}
      title={isDraft ? 'Eliminar borrador' : 'Eliminar actividad'}
      description={activity.title}
      footer={
        <>
          <Button onClick={onClose} disabled={remove.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" className="bg-red-600 hover:bg-red-700" onClick={onDelete} loading={remove.isPending}>
            {!remove.isPending && <Trash2 className="size-3.5" />} Eliminar
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-zinc-700">
        {remove.error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-red-700 ring-1 ring-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {remove.error.message}
          </p>
        )}
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            {isDraft
              ? 'El borrador se borra del todo.'
              : delivered > 0
                ? `Deja de verse para ti, los alumnos y sus familias, junto con ${plural(delivered, 'entrega', 'entregas')}.`
                : 'Deja de verse para ti, los alumnos y sus familias.'}
          </li>
          {activity.gradeColumn && !unitClosed && (
            <li className="font-medium text-red-700">
              Se elimina también su columna del cuadro de notas{filled > 0 ? `, con ${plural(filled, 'nota', 'notas')}. Cambia el total de esos alumnos.` : '.'}
            </li>
          )}
          {activity.gradeColumn && unitClosed && <li>{activity.unit.name} está cerrada: su columna y sus notas se conservan en el cuadro.</li>}
        </ul>
        <p className="text-zinc-500">Esta acción no se puede deshacer.</p>
      </div>
    </Dialog>
  );
}
