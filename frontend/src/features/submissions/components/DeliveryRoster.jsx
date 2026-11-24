import { UserCheck, UserX } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';

const TONES = {
  red: {
    header: 'border-red-200 bg-red-50 text-red-700',
    row: 'border-l-red-500 hover:bg-red-50',
    active: 'bg-red-50',
    name: 'text-red-700',
  },
  green: {
    header: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    row: 'border-l-emerald-500 hover:bg-emerald-50',
    active: 'bg-emerald-50',
    name: 'text-emerald-700',
  },
};

function Group({ title, icon: Icon, tone, items, total, emptyText, selectedId, onSelect }) {
  const colors = TONES[tone];
  return (
    <section>
      <h2 className={cn('sticky top-0 z-[1] flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold', colors.header)}>
        <Icon className="size-4" /> {title}
        <span className="ml-auto text-xs font-medium tabular-nums">
          {items.length} de {total}
        </span>
      </h2>
      {items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-zinc-500">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-zinc-200/70">
          {items.map(({ id, status, student }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelect(id)}
                aria-current={id === selectedId || undefined}
                title={`Ver a ${student.firstName} ${student.lastName}`}
                className={cn(
                  'flex w-full items-center gap-3 border-l-4 px-3 py-2.5 text-left transition-colors',
                  colors.row,
                  id === selectedId && colors.active,
                )}
              >
                <Avatar firstName={student.firstName} lastName={student.lastName} />
                <div className="min-w-0">
                  <p className={cn('truncate text-sm font-medium', colors.name)}>
                    {student.firstName} {student.lastName}
                  </p>
                  <p className="text-xs text-zinc-500">
                    <span className="font-mono">{student.code}</span>
                    {status === 'REJECTED' && ' · en corrección'}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Quiénes no han entregado la actividad (rojo) y quiénes sí (verde). Al hacer clic se abre ese alumno. */
export function DeliveryRoster({ items, isLoading, selectedId, onSelect }) {
  const missing = items.filter((item) => item.status === 'PENDING');
  const delivered = items.filter((item) => item.status !== 'PENDING');

  return (
    <aside
      className="shrink-0 border-zinc-200 bg-white max-lg:border-t lg:min-h-0 lg:w-64 lg:overflow-y-auto lg:border-l xl:w-80"
      aria-label="Quiénes han entregado y quiénes no"
    >
      {isLoading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <>
          <Group
            title="No han entregado"
            icon={UserX}
            tone="red"
            items={missing}
            total={items.length}
            emptyText={items.length ? 'Todos los alumnos entregaron.' : 'Esta actividad aún no tiene alumnos asignados.'}
            selectedId={selectedId}
            onSelect={onSelect}
          />
          <Group
            title="Sí entregaron"
            icon={UserCheck}
            tone="green"
            items={delivered}
            total={items.length}
            emptyText="Todavía nadie ha entregado."
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </>
      )}
    </aside>
  );
}
