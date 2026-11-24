import { useEffect, useRef } from 'react';
import { BellRing, CheckCircle2, Hourglass, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatScore } from '@/lib/format';
import { useSubmissionDetail } from '../hooks';
import { AttemptTimeline } from './AttemptTimeline';
import { ReviewComposer } from './ReviewComposer';

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
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-16 w-3/4" />
    </div>
  );
}

/** La entrega de un alumno (intentos y revisión), abierta debajo de su nombre. */
export function SubmissionReviewPanel({ submissionId, onReview, pendingDecision, reviewError, onReady }) {
  const { data: submission, isLoading, isError, error, refetch } = useSubmissionDetail(submissionId);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Ya con su contenido (y su alto final), la página puede dejarla a la vista
  useEffect(() => {
    if (!isLoading) onReadyRef.current?.(submissionId);
  }, [isLoading, submissionId]);

  return (
    <section className="mt-1 mb-2 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50" aria-label="Detalle de la entrega">
      {isLoading ? (
        <PanelSkeleton />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-zinc-600">{error.message}</p>
          <Button onClick={() => refetch()}>
            <RefreshCw className="size-3.5" /> Reintentar
          </Button>
        </div>
      ) : (
        <>
          <div className="px-4 py-5 sm:px-6">
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
