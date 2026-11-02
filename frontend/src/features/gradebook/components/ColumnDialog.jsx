import { useId, useState } from 'react';
import { AlertCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useCreateItem, useDeleteItem, useUpdateItem } from '../hooks';

const inputClass =
  'h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none';

const toNumber = (text) => Number(String(text).replace(',', '.'));

/**
 * Crear o editar una columna. Montar con `key` distinto por columna para reiniciar el formulario.
 * `item` null = crear.
 */
export function ColumnDialog({ open, onClose, courseId, unitId, item, remainingWeight }) {
  const editing = Boolean(item);
  const [name, setName] = useState(item?.name ?? '');
  const [maxScore, setMaxScore] = useState(String(item?.maxScore ?? 100));
  const [weight, setWeight] = useState(String(item?.weight ?? Math.max(remainingWeight, 0)));
  const [isPublished, setIsPublished] = useState(item?.isPublished ?? false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { filled }
  const ids = { name: useId(), max: useId(), weight: useId(), published: useId() };

  const create = useCreateItem(courseId);
  const update = useUpdateItem(courseId);
  const remove = useDeleteItem(courseId);
  const error = create.error ?? update.error ?? (remove.error?.code === 'HAS_SCORES' ? null : remove.error);

  const max = toNumber(maxScore);
  const weightValue = toNumber(weight);
  const invalid = !name.trim() || !(max > 0) || max > 999.99 || !(weightValue >= 0 && weightValue <= 100);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (invalid) return;
    const body = { name: name.trim(), maxScore: max, weight: weightValue };
    try {
      if (editing) await update.mutateAsync({ itemId: item.id, ...body, isPublished });
      else await create.mutateAsync({ unitId, ...body });
      onClose();
    } catch {
      // El mensaje se muestra desde el estado de la mutación
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync({ itemId: item.id, force: Boolean(confirmDelete) });
      onClose();
    } catch (err) {
      if (err.code === 'HAS_SCORES') setConfirmDelete({ filled: err.details?.filled ?? 0 });
    }
  };

  const busy = create.isPending || update.isPending || remove.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'Editar columna' : 'Nueva columna'}
      description={editing ? undefined : 'Una evaluación de esta unidad: tarea, examen, proyecto…'}
      footer={
        <>
          {editing && (
            <Button
              variant={confirmDelete ? 'warning' : 'ghost'}
              className="mr-auto"
              onClick={onDelete}
              loading={remove.isPending}
              disabled={busy && !remove.isPending}
            >
              {!remove.isPending && <Trash2 className="size-3.5" />}
              {confirmDelete ? `Eliminar con ${confirmDelete.filled} nota(s)` : 'Eliminar'}
            </Button>
          )}
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" form="column-form" variant="primary" loading={create.isPending || update.isPending} disabled={invalid || busy}>
            {editing ? 'Guardar' : 'Agregar columna'}
          </Button>
        </>
      }
    >
      <form id="column-form" onSubmit={onSubmit} className="space-y-4">
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error.message}
          </p>
        )}
        {confirmDelete && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            Esta columna tiene {confirmDelete.filled} nota(s). Se borrarán junto con la columna y no se pueden recuperar.
          </p>
        )}

        <div className="space-y-1.5">
          <label htmlFor={ids.name} className="block text-sm font-medium text-zinc-700">
            Nombre
          </label>
          <input id={ids.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="ej. Examen parcial" data-autofocus className={inputClass} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor={ids.max} className="block text-sm font-medium text-zinc-700">
              Nota máxima
            </label>
            <input id={ids.max} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.weight} className="block text-sm font-medium text-zinc-700">
              Peso en la unidad (%)
            </label>
            <input id={ids.weight} value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" className={inputClass} />
          </div>
        </div>
        <p className="text-xs text-zinc-500">
          El total de la unidad suma nota ÷ máxima × peso de cada columna. Los pesos de todas las columnas deberían sumar 100%.
        </p>

        {editing && (
          <label htmlFor={ids.published} className="flex items-start gap-2.5 rounded-lg border border-zinc-200 p-3">
            <input
              id={ids.published}
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="mt-0.5 size-4 accent-zinc-900"
            />
            <span className="text-sm">
              <span className="font-medium text-zinc-900">Visible para estudiantes y familias</span>
              <span className="block text-zinc-500">Mientras esté oculta, solo tú y la administración ven estas notas.</span>
            </span>
          </label>
        )}
      </form>
    </Dialog>
  );
}
