import { Clock, Inbox, Search } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatRelative, formatScore } from '@/lib/format';
import { StatusBadge } from './StatusBadge';

/** Nombre, estado e intento de un alumno. */
function StudentSummary({ item }) {
  const { student } = item;
  return (
    <>
      <Avatar firstName={student.firstName} lastName={student.lastName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-zinc-900">
            {student.firstName} {student.lastName}
          </p>
          {item.status === 'APPROVED' ? (
            <span className="text-sm font-semibold text-emerald-700 tabular-nums">{formatScore(item.score)}</span>
          ) : (
            <StatusBadge status={item.status} />
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="font-mono">{student.code}</span>
          {item.attemptCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>Intento {item.attemptCount}</span>
              <span aria-hidden>·</span>
              <span>{formatRelative(item.lastSubmittedAt)}</span>
            </>
          )}
          {item.isLate && (
            <span className="ml-auto inline-flex items-center gap-1 text-amber-700">
              <Clock className="size-3" /> Tarde
            </span>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Un alumno a la vez, con su entrega debajo del nombre. El buscador ofrece los alumnos que coinciden;
 * la entrega abierta sigue a la vista mientras tanto, para no perder lo que se escribe.
 */
export function SubmissionViewer({ selected, isLoading, search, results, onSearchChange, onSelect, renderDetail, className }) {
  return (
    <section className={cn('flex min-w-0 flex-col bg-white lg:min-h-0', className)} aria-label="Entregas">
      <div className="p-3">
        <label className="relative block max-w-md">
          <span className="sr-only">Buscar alumno</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por nombre o código"
            className="h-8 w-full rounded-md border border-zinc-200 bg-zinc-50 pr-3 pl-8 text-sm placeholder:text-zinc-400 focus:border-zinc-300 focus:bg-white focus:ring-2 focus:ring-zinc-200 focus:outline-none"
          />
        </label>
        {search.trim() && (
          <ul className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-zinc-200 p-1 shadow-sm" aria-label="Alumnos encontrados">
            {results.length === 0 && <li className="px-3 py-3 text-sm text-zinc-500">No hay alumnos con esta búsqueda.</li>}
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-zinc-100"
                >
                  <StudentSummary item={item} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-zinc-100 p-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : !selected ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Inbox className="size-8 text-zinc-300" />
            <p className="text-sm text-zinc-500">Esta actividad aún no tiene alumnos asignados.</p>
          </div>
        ) : (
          <article id={`entrega-${selected.id}`} key={selected.id} className="scroll-mt-2">
            <header className="flex items-center gap-3 rounded-lg bg-zinc-100 px-3 py-2.5 ring-1 ring-zinc-200">
              <StudentSummary item={selected} />
            </header>
            {renderDetail?.(selected)}
          </article>
        )}
      </div>
    </section>
  );
}
