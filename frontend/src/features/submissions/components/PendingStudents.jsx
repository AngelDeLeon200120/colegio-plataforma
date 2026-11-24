import { CheckCircle2, UserX } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';

/** Quiénes todavía no entregan la actividad. */
export function PendingStudents({ items, total, isLoading }) {
  return (
    <aside className="flex shrink-0 flex-col border-zinc-200 bg-zinc-50 max-lg:border-t lg:min-h-0 lg:w-64 lg:border-l xl:w-80" aria-label="Alumnos que no han entregado">
      <h2 className="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900">
        <UserX className="size-4 text-zinc-500" /> No han entregado
        {!isLoading && (
          <span className="ml-auto text-xs font-medium text-zinc-500 tabular-nums">
            {items.length} de {total}
          </span>
        )}
      </h2>

      {isLoading ? (
        <div className="space-y-3 p-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <CheckCircle2 className="size-8 text-emerald-400" />
          <p className="text-sm text-zinc-500">{total ? 'Todos los alumnos entregaron.' : 'Esta actividad aún no tiene alumnos asignados.'}</p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200/70 px-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {items.map(({ id, student }) => (
            <li key={id} className="flex items-center gap-3 py-2.5">
              <Avatar firstName={student.firstName} lastName={student.lastName} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {student.firstName} {student.lastName}
                </p>
                <p className="font-mono text-xs text-zinc-500">{student.code}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
