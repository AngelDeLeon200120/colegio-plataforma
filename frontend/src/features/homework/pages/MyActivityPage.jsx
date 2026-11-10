import { Link, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, BellRing, CalendarClock, CheckCircle2, Clock, Eye, Hourglass, Lock } from 'lucide-react';
import { FileChip } from '@/components/ui/FileChip';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatDateTime, formatScore } from '@/lib/format';
import { AttemptTimeline } from '@/features/submissions/components/AttemptTimeline';
import { StatusBadge } from '@/features/submissions/components/StatusBadge';
import { homeworkApi } from '../api';
import { SubmitForm } from '../components/SubmitForm';
import { homeworkKeys, useHomeworkLiveUpdates, useMyActivity, useViewedStudent } from '../hooks';
import { ACTIVITY_TYPES, dueLabel, isOverdue } from '../model';

function Callout({ tone, icon: Icon, title, children }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-900 ring-amber-200',
    blue: 'bg-blue-50 text-blue-900 ring-blue-200',
    green: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    red: 'bg-red-50 text-red-900 ring-red-200',
    zinc: 'bg-zinc-50 text-zinc-700 ring-zinc-200',
  };
  return (
    <div className={cn('flex gap-3 rounded-lg px-4 py-3 ring-1', tones[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-1 opacity-90">{children}</div>}
      </div>
    </div>
  );
}

/** Mensaje principal según el estado: lo primero que la persona necesita saber. */
function StatusCallout({ activity, isParent, studentName }) {
  const { status, score, lastFeedback, lastSubmittedAt, isLate } = activity.submission;

  if (status === 'REJECTED') {
    return (
      <Callout tone="amber" icon={BellRing} title={isParent ? `El docente pidió correcciones a ${studentName}` : 'Tu docente pidió correcciones'}>
        {lastFeedback && <p className="whitespace-pre-line">“{lastFeedback}”</p>}
        {!isParent && <p className="mt-1">Corrige tu trabajo y vuelve a enviarlo abajo. Recibirás recordatorios hasta que lo hagas.</p>}
      </Callout>
    );
  }
  if (status === 'SUBMITTED') {
    return (
      <Callout tone="blue" icon={Hourglass} title={`Entregada${isLate ? ' fuera de plazo' : ''} · en revisión`}>
        {isParent ? `${studentName} la entregó` : 'La entregaste'} el {formatDateTime(lastSubmittedAt)} y la revisará {activity.teacherName}.
      </Callout>
    );
  }
  if (status === 'APPROVED') {
    return (
      <Callout
        tone="green"
        icon={CheckCircle2}
        title={
          activity.submission.scoreWithheld
            ? 'Aprobada · Nota pendiente'
            : score !== null
              ? `Aprobada · ${formatScore(score)} de ${formatScore(activity.maxScore)}`
              : 'Aprobada'
        }
      >
        {lastFeedback && <p className="whitespace-pre-line">“{lastFeedback}”</p>}
      </Callout>
    );
  }
  if (isOverdue(activity)) {
    return (
      <Callout tone="red" icon={Clock} title={dueLabel(activity.dueAt).text}>
        {activity.allowLate && !activity.isClosed
          ? 'Todavía se puede entregar; quedará marcada como tardía.'
          : 'El plazo cerró y esta actividad ya no recibe entregas.'}
      </Callout>
    );
  }
  return null;
}

export function MyActivityPage() {
  const { activityId } = useParams();
  const { isParent, studentId } = useViewedStudent();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useMyActivity(activityId, studentId, { enabled: !isParent || Boolean(studentId) });
  useHomeworkLiveUpdates();

  const backTo = `/my/activities${isParent && studentId ? `?student=${studentId}` : ''}`;

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="size-8 text-amber-500" />
        <p className="text-sm text-zinc-600">{error.message}</p>
        <Link to={backTo} className="text-sm font-medium text-blue-700 hover:underline">
          Volver a las tareas
        </Link>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const { activity, attempts, reviews, canSubmit, submitBlocker, student } = data;
  const due = dueLabel(activity.dueAt);
  const studentName = student.firstName;

  const submit = async (input, onProgress) => {
    await homeworkApi.submit(activity.id, input, onProgress);
    await queryClient.invalidateQueries({ queryKey: homeworkKeys.all });
  };

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" /> {isParent ? `Tareas de ${studentName}` : 'Mis tareas'}
      </Link>

      <header className="mt-3">
        <p className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="size-2 rounded-full" style={{ backgroundColor: activity.subject.color ?? '#a1a1aa' }} aria-hidden />
          {activity.subject.name} · {ACTIVITY_TYPES[activity.type]} · {activity.unit.name}
          {activity.isClosed && (
            <span className="inline-flex items-center gap-1">
              · <Lock className="size-3" /> cerrada
            </span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{activity.title}</h1>
          <StatusBadge status={activity.submission.status} />
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-4" />
            {activity.dueAt ? formatDateTime(activity.dueAt) : 'Sin fecha límite'}
            {['PENDING', 'REJECTED'].includes(activity.submission.status) && activity.dueAt && (
              <span className={cn(due.tone === 'danger' ? 'text-red-600' : due.tone === 'warning' ? 'text-amber-700' : '')}>({due.text.toLowerCase()})</span>
            )}
          </span>
          {activity.maxScore !== null && <span>{formatScore(activity.maxScore)} puntos</span>}
          <span>Docente: {activity.teacherName}</span>
        </p>
      </header>

      <div className="mt-5 space-y-5">
        {isParent && (
          <Callout tone="zinc" icon={Eye} title="Vista de familia">
            Puedes ver el avance de {studentName}. Solo {studentName} puede entregar desde su cuenta.
          </Callout>
        )}
        <StatusCallout activity={activity} isParent={isParent} studentName={studentName} />

        {activity.description && (
          <section>
            <h2 className="mb-1.5 text-sm font-semibold text-zinc-900">Instrucciones</h2>
            <p className="text-sm leading-relaxed whitespace-pre-line text-zinc-700">{activity.description}</p>
          </section>
        )}

        {activity.resources.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">Material de apoyo</h2>
            <div className="flex flex-wrap gap-2">
              {activity.resources.map((file) => (
                <FileChip key={file.id} file={file} />
              ))}
            </div>
          </section>
        )}

        {canSubmit && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">
              {activity.submission.status === 'REJECTED' ? 'Enviar tu corrección' : 'Tu entrega'}
            </h2>
            <SubmitForm
              isResubmission={activity.submission.status === 'REJECTED'}
              lateWarning={isOverdue(activity) ? 'Se enviará como entrega tardía.' : null}
              onSubmit={submit}
            />
          </section>
        )}
        {!canSubmit && submitBlocker && !['READ_ONLY', 'ALREADY_SUBMITTED'].includes(submitBlocker.code) && !isOverdue(activity) && (
          <p className="text-sm text-zinc-500">{submitBlocker.message}</p>
        )}

        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Historial</h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
            <AttemptTimeline
              attempts={attempts}
              reviews={reviews}
              maxScore={activity.maxScore}
              emptyMessage={isParent ? `${studentName} todavía no ha entregado esta actividad.` : 'Todavía no has entregado esta actividad.'}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
