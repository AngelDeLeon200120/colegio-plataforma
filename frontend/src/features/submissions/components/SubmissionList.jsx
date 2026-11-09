import { Clock, Inbox, Search } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatRelative, formatScore } from '@/lib/format';
import { FILTERS } from '../constants';
import { StatusBadge } from './StatusBadge';

const EMPTY_MESSAGES = {
  SUBMITTED: 'No hay entregas por revisar. ¡Todo al día!',
  REJECTED: 'Ningún alumno tiene correcciones pendientes.',
  PENDING: 'Todos los alumnos entregaron.',
  APPROVED: 'Aún no has aprobado entregas.',
  ALL: 'No hay alumnos con esta búsqueda.',
};

/** Pestañas de estado: si no caben en una fila, bajan a la siguiente. */
function FilterTabs({ value, onChange, summary }) {
  return (
    <div role="tablist" aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5 px-3 pb-2">
      {FILTERS.map((filter) => {
        const count = filter.value === 'ALL' ? summary.total : summary[filter.value];
        const active = filter.value === value;
        return (
          <button
            key={filter.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(filter.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100',
            )}
          >
            {filter.label}
            <span className={cn('tabular-nums', active ? 'text-zinc-300' : 'text-zinc-400')}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function SubmissionRow({ item, selected, onSelect }) {
  const { student } = item;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        aria-current={selected || undefined}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
          selected ? 'bg-zinc-100 ring-1 ring-zinc-200' : 'hover:bg-zinc-50',
        )}
      >
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
      </button>
    </li>
  );
}

export function SubmissionList({ items, summary, isLoading, filter, onFilterChange, search, onSearchChange, selectedId, onSelect, className }) {
  return (
    <section className={cn('flex min-h-0 min-w-0 flex-col border-r border-zinc-200 bg-white', className)} aria-label="Entregas">
      <div className="space-y-3 pt-3">
        <div className="px-3">
          <label className="relative block">
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
        </div>
        {summary && <FilterTabs value={filter} onChange={onFilterChange} summary={summary} />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-zinc-100 p-2">
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
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Inbox className="size-8 text-zinc-300" />
            <p className="text-sm text-zinc-500">{EMPTY_MESSAGES[filter]}</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {items.map((item) => (
              <SubmissionRow key={item.id} item={item} selected={item.id === selectedId} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
