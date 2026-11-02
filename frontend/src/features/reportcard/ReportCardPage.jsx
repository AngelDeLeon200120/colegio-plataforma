import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Lock, Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { StudentSwitcher } from '@/features/homework/components/StudentSwitcher';
import { useViewedStudent } from '@/features/homework/hooks';
import { api } from '@/lib/apiClient';
import { cn } from '@/lib/cn';
import { formatScore } from '@/lib/format';

function useReportCard(studentId, unitId, enabled) {
  const params = new URLSearchParams();
  if (studentId) params.set('studentId', studentId);
  if (unitId) params.set('unitId', unitId);
  return useQuery({
    queryKey: ['report-card', studentId ?? 'me', unitId ?? 'current'],
    queryFn: () => api(`/me/report-card${params.toString() ? `?${params}` : ''}`),
    enabled,
    placeholderData: (previous) => previous,
  });
}

// El color depende del rendimiento sobre lo publicado, no de la zona parcial
const toneFor = (percent, passing) => (percent === null ? 'text-zinc-400' : percent < passing ? 'text-red-600' : 'text-emerald-700');

/** "29/30" a mitad de unidad (con su %), "85/100" cuando ya está todo publicado. */
function ResultBadge({ result, passing }) {
  if (result.percent === null) return <span className="text-lg font-semibold text-zinc-400">—</span>;
  const partial = result.published < 100;
  return (
    <span className="text-right">
      <span className={cn('block text-lg font-semibold tabular-nums', toneFor(result.percent, passing))}>
        {formatScore(result.total)}
        <span className="text-sm font-normal text-zinc-400">/{formatScore(partial ? result.published : 100)}</span>
      </span>
      {partial && <span className="block text-[11px] text-zinc-500">{formatScore(result.percent)} % de lo publicado</span>}
    </span>
  );
}

function CourseCard({ course, passing }) {
  return (
    <article className="break-inside-avoid rounded-xl border border-zinc-200 bg-white shadow-xs">
      <header className="flex items-start gap-3 border-b border-zinc-100 px-4 py-3">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: course.color ?? '#a1a1aa' }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900">{course.subject}</h3>
          <p className="text-xs text-zinc-500">{course.teacher}</p>
        </div>
        <ResultBadge result={course} passing={passing} />
      </header>
      {course.items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-zinc-500">Aún no hay notas publicadas en esta unidad.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100">
            {course.items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-2 text-zinc-700">{item.name}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                  {item.isExcused ? (
                    <span className="text-zinc-500">Exonerado</span>
                  ) : item.score === null ? (
                    <span className="text-zinc-400">Sin nota</span>
                  ) : (
                    <>
                      <span className="font-medium">{formatScore(item.score)}</span>
                      <span className="text-zinc-400">/{formatScore(item.maxScore)}</span>
                    </>
                  )}
                </td>
                <td className="w-20 px-4 py-2 text-right text-xs text-zinc-500 tabular-nums">{formatScore(item.weight)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}

/** Boleta: notas publicadas por unidad y resumen del ciclo. Estudiantes y familias. */
export function ReportCardPage() {
  const { isParent, children, studentId, selectStudent } = useViewedStudent();
  const [searchParams, setSearchParams] = useSearchParams();
  const unitParam = searchParams.get('unit');
  const { data, isLoading, isError, error, isFetching } = useReportCard(studentId, unitParam, !isParent || Boolean(studentId));

  const selectUnit = (unitId) =>
    setSearchParams((params) => {
      params.set('unit', String(unitId));
      return params;
    });

  if (isError) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-zinc-600">
        <AlertTriangle className="size-4 text-amber-500" /> {error.message}
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6 sm:px-6">
      <div className="print-area space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-normal text-zinc-900">
              {isParent ? `Notas de ${data?.student.firstName ?? '…'}` : 'Mis notas'}
            </h1>
            {data && (
              <p className="mt-0.5 text-sm text-zinc-500">
                {data.student.firstName} {data.student.lastName} · {data.student.section} · Ciclo {data.year}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <StudentSwitcher students={children} studentId={studentId} onChange={selectStudent} />
            {data && (
              <div role="tablist" aria-label="Unidad" className="flex flex-wrap gap-1.5">
                {data.units.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    role="tab"
                    aria-selected={unit.id === data.unit.id}
                    onClick={() => selectUnit(unit.id)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      unit.id === data.unit.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100',
                    )}
                  >
                    {unit.status === 'CLOSED' && <Lock className="size-3" />}
                    {unit.name}
                  </button>
                ))}
              </div>
            )}
            <Button size="sm" onClick={() => window.print()} disabled={!data}>
              <Printer className="size-3.5" /> Imprimir
            </Button>
          </div>
        </header>

        {isLoading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : (
          <div className={cn('space-y-6 transition-opacity', isFetching && 'opacity-60')}>
            <section className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-xs">
              <div>
                <p className="text-xs font-medium text-zinc-500">
                  {data.complete ? `Promedio · ${data.unit.name}` : `Rendimiento hasta ahora · ${data.unit.name}`}
                </p>
                <p className={cn('text-3xl font-semibold tabular-nums', toneFor(data.average, data.passingScore))}>
                  {data.average === null ? '—' : formatScore(data.average)}
                  {data.average !== null && <span className="text-sm font-normal text-zinc-400">{data.complete ? '/100' : ' %'}</span>}
                </p>
              </div>
              <p className="max-w-md text-xs text-zinc-500">
                {data.complete
                  ? `Zona sobre 100 en cada materia; se aprueba con ${data.passingScore}.`
                  : `La unidad sigue en curso: cada materia muestra los puntos obtenidos sobre los que su docente ya publicó (se aprueba con el ${data.passingScore} %). La zona final se completa al publicarse todas las evaluaciones.`}
              </p>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              {data.courses.map((course) => (
                <CourseCard key={course.id} course={course} passing={data.passingScore} />
              ))}
            </section>

            {data.units.length > 1 && (
              <section className="break-inside-avoid">
                <h2 className="mb-2 text-sm font-semibold text-zinc-900">Resumen del ciclo</h2>
                <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-xs">
                  <table className="w-full text-sm">
                    <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Materia</th>
                        {data.units.map((unit) => (
                          <th key={unit.id} className="px-4 py-2 text-right font-medium">
                            {unit.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {data.overview.map((row) => (
                        <tr key={row.courseId}>
                          <td className="px-4 py-2">
                            <span className="inline-flex items-center gap-2">
                              <span className="size-2 rounded-full" style={{ backgroundColor: row.color ?? '#a1a1aa' }} aria-hidden />
                              {row.subject}
                            </span>
                          </td>
                          {data.units.map((unit) => {
                            const cell = row.units[unit.id];
                            return (
                              <td key={unit.id} className={cn('px-4 py-2 text-right font-medium tabular-nums', toneFor(cell.percent, data.passingScore))}>
                                {cell.percent === null ? '—' : formatScore(cell.total)}
                                {cell.percent !== null && cell.published < 100 && (
                                  <span className="text-xs font-normal text-zinc-400"> /{formatScore(cell.published)}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
