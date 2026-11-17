import { AlertTriangle, CalendarClock, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { StudentSwitcher } from '@/features/homework/components/StudentSwitcher';
import { useViewedStudent } from '@/features/homework/hooks';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime } from '@/lib/format';
import { useConductLive, useFamilyConduct } from './hooks';
import { CATEGORIES, DECISIONS, FOLLOWUP_STATUS, counterTone } from './model';

/** Familia: los reportes de conducta de su hijo o hija, el contador y el seguimiento de la institución. */
export function FamilyConductPage() {
  const { children, studentId, selectStudent } = useViewedStudent();
  const { data, isLoading, isError, error } = useFamilyConduct(studentId);
  useConductLive();
  const child = children.find((item) => item.id === studentId);
  const tone = data ? counterTone(data.reportCount, data.threshold) : 'neutral';
  const active = data?.followups.find((followup) => followup.status !== 'RESUELTO');

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-normal text-zinc-900">Conducta {child && `de ${child.firstName}`}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Reportes de docentes y de la administración durante el ciclo.</p>
        </div>
        <StudentSwitcher students={children} studentId={studentId} onChange={selectStudent} />
      </header>

      {!studentId && <p className="mt-6 text-sm text-zinc-500">Tu cuenta aún no está vinculada a ningún estudiante.</p>}
      {isError && <p className="mt-6 text-sm text-red-600">{error.message}</p>}
      {isLoading && studentId && <Skeleton className="mt-6 h-40 w-full rounded-xl" />}

      {data && (
        <div className="mt-6 space-y-5">
          <section
            className={cn(
              'flex flex-wrap items-center gap-4 rounded-xl border px-5 py-4',
              { neutral: 'border-emerald-200 bg-emerald-50', blue: 'border-blue-200 bg-blue-50', amber: 'border-amber-200 bg-amber-50', red: 'border-red-200 bg-red-50' }[tone],
            )}
          >
            <p className="text-3xl font-semibold text-zinc-900 tabular-nums">
              {data.reportCount}
              <span className="text-base font-normal text-zinc-500"> / {data.threshold}</span>
            </p>
            <p className="min-w-0 flex-1 text-sm text-zinc-700">
              {data.reportCount === 0
                ? 'Sin reportes en este ciclo. ¡Excelente!'
                : data.reportCount < data.threshold
                  ? `Reportes en el ciclo. Al llegar a ${data.threshold}, la institución se reúne con la familia o el tutor.`
                  : 'Llegó al límite de reportes: la institución dará seguimiento con la familia.'}
            </p>
            {tone === 'neutral' ? <ShieldCheck className="size-8 text-emerald-600" /> : tone === 'red' && <AlertTriangle className="size-8 text-red-600" />}
          </section>

          {active && (
            <section className="rounded-xl border border-amber-200 bg-white p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <CalendarClock className="size-4 text-amber-600" /> Seguimiento de la institución
                <Badge tone={FOLLOWUP_STATUS[active.status].tone}>{active.status === 'PENDIENTE' ? 'En revisión' : FOLLOWUP_STATUS[active.status].label}</Badge>
              </p>
              <p className="mt-1 text-sm text-zinc-700">
                {active.meetingAt
                  ? `${DECISIONS[active.decision] ?? 'Reunión'}: ${formatDateTime(active.meetingAt)}. Les esperamos en el colegio.`
                  : 'La institución revisará el caso y se comunicará para coordinar una reunión.'}
              </p>
            </section>
          )}

          {data.followups
            .filter((followup) => followup.status === 'RESUELTO' && followup.outcome)
            .map((followup) => (
              <section key={followup.id} className="rounded-xl border border-emerald-200 bg-white p-4 text-sm">
                <p className="flex items-center gap-2 font-semibold text-zinc-900">
                  <CheckCircle2 className="size-4 text-emerald-600" /> Acuerdos ({followup.reportCount} reportes)
                </p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-700">{followup.outcome}</p>
              </section>
            ))}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">Reportes</h2>
            {data.reports.length === 0 ? (
              <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500">No hay reportes.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
                {data.reports.map((report) => {
                  const look = CATEGORIES[report.category] ?? CATEGORIES.OTRO;
                  return (
                    <li key={report.id} className="flex gap-3 px-4 py-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: look.color }} aria-hidden>
                        <look.icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-900">{look.label}</p>
                        <p className="text-sm whitespace-pre-wrap text-zinc-700">{report.description}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatDate(report.incidentDate)} · {report.reportedBy.name}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
