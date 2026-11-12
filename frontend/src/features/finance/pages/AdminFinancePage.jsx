import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertTriangle, ChevronRight, FilePlus2, Search, Users, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatDate, formatMoney } from '@/lib/format';
import { GenerateChargesDialog } from '../components/GenerateChargesDialog';
import { ReportedPaymentsPanel } from '../components/ReportedPayments';
import { usePortfolio } from '../hooks';

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Cartera: quién debe, cuánto y desde cuándo. Los morosos primero. */
export function AdminFinancePage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const query = useDebounced(search.trim());
  const { data, isLoading, isError, error } = usePortfolio(query);

  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-normal text-zinc-900">Finanzas</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Cartera del ciclo activo. Elige un estudiante para ver su estado de cuenta o registrar un pago.</p>
        </div>
        <Button variant="primary" onClick={() => setGenerating(true)}>
          <FilePlus2 className="size-3.5" /> Generar cargos
        </Button>
      </header>

      <ReportedPaymentsPanel focus={searchParams.get('verify') === '1'} />

      {data && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Wallet, label: 'Por cobrar', value: formatMoney(data.totals.totalDue) },
            { icon: AlertTriangle, label: 'Vencido', value: formatMoney(data.totals.overdue), danger: data.totals.overdue > 0 },
            { icon: Users, label: 'Familias con atraso', value: data.totals.studentsOverdue, danger: data.totals.studentsOverdue > 0 },
          ].map(({ icon: Icon, label, value, danger }) => (
            <div key={label} className={cn('rounded-xl border bg-white p-4 shadow-xs', danger ? 'border-red-200' : 'border-zinc-200')}>
              <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
                <Icon className="size-3.5" /> {label}
              </p>
              <p className={cn('mt-1 text-xl font-semibold tabular-nums', danger ? 'text-red-600' : 'text-zinc-900')}>{value}</p>
            </div>
          ))}
        </div>
      )}

      <label className="relative mt-6 block max-w-sm">
        <span className="sr-only">Buscar estudiante</span>
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre o código"
          className="h-9 w-full rounded-md border border-zinc-200 bg-white pr-3 pl-8 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
        />
      </label>

      <div className="mt-3">
        {isError && <p className="text-sm text-red-600">{error.message}</p>}
        {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
        {data && (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-xs">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-500">
                  <th className="px-4 py-2 font-medium">Estudiante</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">Sección</th>
                  <th className="px-3 py-2 text-right font-medium">Saldo</th>
                  <th className="px-3 py-2 text-right font-medium">Vencido</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Pendiente desde</th>
                  <th className="w-px px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.students.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                      Ningún estudiante coincide con la búsqueda.
                    </td>
                  </tr>
                )}
                {data.students.map((student) => (
                  <tr key={student.id} className="relative hover:bg-zinc-50">
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/finance/${student.id}`} className="font-medium text-zinc-900 after:absolute after:inset-0">
                        {student.lastName}, {student.firstName}
                      </Link>
                      <span className="block font-mono text-xs text-zinc-500">{student.code}</span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-zinc-600 sm:table-cell">{student.section}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(student.totalDue)}</td>
                    <td className={cn('px-3 py-2.5 text-right tabular-nums', student.overdue > 0 ? 'font-semibold text-red-600' : 'text-zinc-400')}>
                      {formatMoney(student.overdue)}
                    </td>
                    <td className="hidden px-3 py-2.5 text-zinc-600 md:table-cell">{student.nextDue ? formatDate(student.nextDue) : '—'}</td>
                    <td className="px-2 py-2.5">
                      <ChevronRight className="size-4 text-zinc-300" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {generating && <GenerateChargesDialog onClose={() => setGenerating(false)} />}
    </div>
  );
}
