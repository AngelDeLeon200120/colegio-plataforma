import { ArrowLeft, BellRing, CheckCircle2, Hourglass, MousePointerClick, RefreshCw } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatDateTime, formatScore } from '@/lib/format';
import { useSubmissionDetail } from '../hooks';
import { AttemptTimeline } from './AttemptTimeline';
import { ReviewComposer } from './ReviewComposer';
import { StatusBadge } from './StatusBadge';

function StatusFooter({ submission }) {
  const { status, activity } = submission;

  const content = {
    PENDING: {
      icon: Hourglass,
      className: 'bg-zinc-50 text-zinc-600 ring-zinc-200',
      text: 'El alumno aún no entrega. Se le notifica a él y a sus encargados cada día mientras esté vencida.',
    },
    REJECTED: {
      icon: BellRing,
      className: 'bg-amber-50 text-amber-800 ring-amber-200',
      text: 'Esperando que el alumno reenvíe la corrección. Los recordatorios automáticos siguen activos.',
    },
    APPROVED: {
      icon: CheckCircle2,
      className: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
      text:
        submission.score !== null
          ? `Aprobada con ${formatScore(submission.score)} de ${formatScore(activity.maxScore)} puntos.`
          : 'Aprobada sin nota.',
    },
  }[status];

  if (!content) return null;
  const Icon = content.icon;

  return (
    <div className="border-t border-zinc-200 bg-white p-4">
      <p className={cn('flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ring-1', content.className)}>
        <Icon className="mt-0.5 size-4 shrink-0" />
        {content.text}
      </p>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-3/4" />
    </div>
  );
}

export function SubmissionReviewPanel({ submissionId, onBack, onReview, pendingDecision, reviewError, className }) {
  const { data: submission, isLoading, isError, error, refetch, isFetching } = useSubmissionDetail(submissionId);

  if (!submissionId) {
    return (
      <section className={cn('flex flex-1 flex-col items-center justify-center gap-2 bg-zinc-50 text-center', className)}>
        <MousePointerClick className="size-8 text-zinc-300" />
        <p className="text-sm text-zinc-500">Selecciona una entrega para revisarla.</p>
      </section>
    );
  }

  return (
    <section className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-zinc-50', className)} aria-label="Detalle de la entrega">
      {isLoading ? (
        <PanelSkeleton />
      ) : isError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-zinc-600">{error.message}</p>
          <Button onClick={() => refetch()}>
            <RefreshCw className="size-3.5" /> Reintentar
          </Button>
        </div>
      ) : (
        <>
          <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
            <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={onBack} aria-label="Volver a la lista">
              <ArrowLeft className="size-4" />
            </Button>
            <Avatar firstName={submission.student.firstName} lastName={submission.student.lastName} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-zinc-900">
                {submission.student.firstName} {submission.student.lastName}
              </h2>
              <p className="text-xs text-zinc-500">
                <span className="font-mono">{submission.student.code}</span>
                {submission.lastSubmittedAt && <> · Última entrega {formatDateTime(submission.lastSubmittedAt)}</>}
              </p>
            </div>
            {isFetching && <RefreshCw className="size-3.5 animate-spin text-zinc-400" aria-label="Actualizando" />}
            <StatusBadge status={submission.status} />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <AttemptTimeline attempts={submission.attempts} reviews={submission.reviews} maxScore={submission.activity.maxScore} />
          </div>

          {submission.status === 'SUBMITTED' ? (
            <ReviewComposer
              key={`${submission.id}:${submission.version}`}
              maxScore={submission.activity.maxScore}
              pendingDecision={pendingDecision}
              error={reviewError}
              onSubmit={(decision, input) => onReview({ submissionId: submission.id, version: submission.version, decision, ...input })}
            />
          ) : (
            <StatusFooter submission={submission} />
          )}
        </>
      )}
    </section>
  );
}
