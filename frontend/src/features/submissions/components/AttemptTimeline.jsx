import { CheckCircle2, Clock, RotateCcw, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { FileChip } from '@/components/ui/FileChip';
import { cn } from '@/lib/cn';
import { formatDateTime, formatScore } from '@/lib/format';

function TimelineItem({ icon: Icon, iconClassName, children, last }) {
  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {!last && <span className="absolute top-8 bottom-0 left-[15px] w-px bg-zinc-200" aria-hidden />}
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white', iconClassName)}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1">{children}</div>
    </li>
  );
}

function AttemptEntry({ attempt, last }) {
  return (
    <TimelineItem icon={Upload} iconClassName="bg-blue-50 text-blue-600" last={last}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-zinc-900">Intento {attempt.number} entregado</p>
        <time className="text-xs text-zinc-500" dateTime={attempt.submittedAt}>
          {formatDateTime(attempt.submittedAt)}
        </time>
        {attempt.isLate && (
          <Badge tone="amber">
            <Clock className="size-3" /> Fuera de plazo
          </Badge>
        )}
      </div>
      {attempt.comment && (
        <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700 ring-1 ring-zinc-100">“{attempt.comment}”</p>
      )}
      {attempt.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {attempt.files.map((file) => (
            <FileChip key={file.id} file={file} />
          ))}
        </div>
      )}
    </TimelineItem>
  );
}

function ReviewEntry({ review, maxScore, last }) {
  const approved = review.decision === 'APPROVED';
  return (
    <TimelineItem
      icon={approved ? CheckCircle2 : RotateCcw}
      iconClassName={approved ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}
      last={last}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-zinc-900">
          {approved ? 'Aprobada' : 'Corrección solicitada'}
          <span className="font-normal text-zinc-500"> por {review.reviewer.name}</span>
        </p>
        <time className="text-xs text-zinc-500" dateTime={review.createdAt}>
          {formatDateTime(review.createdAt)}
        </time>
        {approved && review.score !== null && (
          <Badge tone="green">
            {formatScore(review.score)} / {formatScore(maxScore)}
          </Badge>
        )}
      </div>
      {review.feedback && (
        <p
          className={cn(
            'mt-2 rounded-lg px-3 py-2 text-sm ring-1',
            approved ? 'bg-emerald-50/60 text-emerald-900 ring-emerald-100' : 'bg-amber-50/70 text-amber-900 ring-amber-100',
          )}
        >
          {review.feedback}
        </p>
      )}
    </TimelineItem>
  );
}

/** Intentos y revisiones intercalados en orden cronológico. */
export function AttemptTimeline({
  attempts,
  reviews,
  maxScore,
  emptyMessage = 'El estudiante todavía no ha entregado esta actividad.',
}) {
  const entries = [
    ...attempts.map((attempt) => ({ kind: 'attempt', at: attempt.submittedAt, key: `a${attempt.id}`, attempt })),
    ...reviews.map((review) => ({ kind: 'review', at: review.createdAt, key: `r${review.id}`, review })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  if (entries.length === 0) {
    return <p className="py-10 text-center text-sm text-zinc-500">{emptyMessage}</p>;
  }

  return (
    <ol>
      {entries.map((entry, index) => {
        const last = index === entries.length - 1;
        return entry.kind === 'attempt' ? (
          <AttemptEntry key={entry.key} attempt={entry.attempt} last={last} />
        ) : (
          <ReviewEntry key={entry.key} review={entry.review} maxScore={maxScore} last={last} />
        );
      })}
    </ol>
  );
}
