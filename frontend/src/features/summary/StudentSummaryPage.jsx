import { Link } from 'react-router';
import { AlertTriangle, Award, BookOpen, CalendarClock, CheckCircle2, ChevronRight, ClipboardCheck, Hourglass, Video } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/features/auth/store';
import { useHomeworkLiveUpdates, useMyActivities } from '@/features/homework/hooks';
import { ACTIVITY_TYPES, dueLabel, groupOf } from '@/features/homework/model';
import { useMeetings, useMeetingsLive } from '@/features/meetings/hooks';
import { useReportCard } from '@/features/reportcard/hooks';
import { cn } from '@/lib/cn';
import { formatDateTime, formatScore } from '@/lib/format';

const DUE_TONES = { danger: 'text-red-600', warning: 'text-amber-700', muted: 'text-zinc-500' };

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function StatCard({ icon: Icon, label, value, to, tone = 'zinc' }) {
  const tones = { zinc: 'text-zinc-900', red: 'text-red-600', blue: 'text-blue-700', green: 'text-emerald-700' };
  return (
    <Link to={to} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs transition-colors hover:bg-zinc-50">
      <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tones[tone])}>{value}</p>
    </Link>
  );
}

function Section({ title, action, empty, count, children }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {action}
      </div>
      {count ? (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">{children}</ul>
      ) : (
        <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500">{empty}</p>
      )}
    </section>
  );
}

const SeeAll = ({ to, children = 'Ver todo' }) => (
  <Link to={to} className="text-xs font-medium text-brand-700 hover:underline">
    {children}
  </Link>
);

/** Resumen del estudiante: sus cursos, lo que tiene pendiente, sus notas recientes y sus próximas clases en línea. */
export function StudentSummaryPage() {
  const user = useAuthStore((state) => state.user);
  const activitiesQuery = useMyActivities(null);
  const reportQuery = useReportCard(null, null);
  const meetingsQuery = useMeetings();
  useHomeworkLiveUpdates();
  useMeetingsLive();

  const loading = activitiesQuery.isLoading || reportQuery.isLoading;
  const activities = activitiesQuery.data?.activities ?? [];
  const report = reportQuery.data;
  const now = Date.now();

  const byDue = (a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity);
  const attention = activities.filter((activity) => groupOf(activity) === 'attention').sort(byDue);
  const todo = activities.filter((activity) => groupOf(activity) === 'todo').sort(byDue);
  const pending = [...attention, ...todo];
  const inReview = activities.filter((activity) => groupOf(activity) === 'review');
  const recentGrades = activities
    .filter((activity) => groupOf(activity) === 'done' && activity.submission.score !== null && activity.submission.score !== undefined)
    .sort((a, b) => new Date(b.submission.reviewedAt ?? 0) - new Date(a.submission.reviewedAt ?? 0))
    .slice(0, 4);
  const pendingByCourse = pending.reduce(
    (counts, activity) => counts.set(activity.course.id, (counts.get(activity.course.id) ?? 0) + 1),
    new Map(),
  );

  const meetings = (meetingsQuery.data?.meetings ?? [])
    .filter((meeting) => meeting.status !== 'CANCELLED' && new Date(meeting.endsAt).getTime() > now)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
    .slice(0, 3);

  const withheld = report?.unit?.withheld;
  const passing = report?.passingScore ?? 60;
  const average = withheld ? null : (report?.average ?? null);

  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-2xl font-normal text-zinc-900">
          {greeting()}, {user?.firstName}
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          {report ? `${report.student.section} · ${report.unit?.name ?? 'Sin unidad activa'}` : 'Esto es lo que tienes hoy.'}
        </p>
      </header>

      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {(activitiesQuery.isError || reportQuery.isError) && (
            <p className="mt-4 flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="size-4" /> {(activitiesQuery.error ?? reportQuery.error).message}
            </p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              icon={ClipboardCheck}
              label="Por entregar"
              value={pending.length}
              to="/my/activities"
              tone={pending.length ? 'blue' : 'zinc'}
            />
            <StatCard
              icon={AlertTriangle}
              label="Requieren atención"
              value={attention.length}
              to="/my/activities"
              tone={attention.length ? 'red' : 'zinc'}
            />
            <StatCard icon={Hourglass} label="En revisión" value={inReview.length} to="/my/activities" />
            <StatCard
              icon={Award}
              label="Promedio de la unidad"
              value={withheld ? 'Pendiente' : average === null ? '—' : formatScore(Math.round(average * 10) / 10)}
              to="/my/grades"
              tone={average === null ? 'zinc' : average < passing ? 'red' : 'green'}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="space-y-6">
              <Section
                title="Tareas pendientes"
                action={<SeeAll to="/my/activities">Ver mis tareas</SeeAll>}
                empty="No tienes tareas pendientes. ¡Todo al día!"
                count={pending.length}
              >
                {pending.slice(0, 8).map((activity) => {
                  const due = dueLabel(activity.dueAt);
                  const corrections = activity.submission.status === 'REJECTED';
                  return (
                    <li key={activity.id}>
                      <Link to={`/my/activities/${activity.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: activity.subject.color ?? '#a1a1aa' }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-zinc-900">{activity.title}</span>
                          <span className="block text-xs text-zinc-500">
                            {activity.subject.name} · {ACTIVITY_TYPES[activity.type] ?? 'Actividad'}
                            {corrections && <span className="font-medium text-red-600"> · Corrección pedida</span>}
                          </span>
                        </span>
                        <span className={cn('shrink-0 text-xs font-medium', DUE_TONES[due.tone])}>{due.text}</span>
                        <ChevronRight className="size-4 shrink-0 text-zinc-300" />
                      </Link>
                    </li>
                  );
                })}
              </Section>

              <Section
                title="Calificadas recientemente"
                action={<SeeAll to="/my/grades">Ver mis notas</SeeAll>}
                empty="Todavía no tienes tareas calificadas en esta unidad."
                count={recentGrades.length}
              >
                {recentGrades.map((activity) => (
                  <li key={activity.id}>
                    <Link to={`/my/activities/${activity.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-900">{activity.title}</span>
                        <span className="block text-xs text-zinc-500">{activity.subject.name}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-zinc-900 tabular-nums">
                        {formatScore(activity.submission.score)}
                        <span className="text-xs font-normal text-zinc-500">/{formatScore(activity.maxScore)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </Section>
            </div>

            <div className="space-y-6">
              <Section
                title="Mis cursos"
                action={<SeeAll to="/my/grades">Boleta</SeeAll>}
                empty="No estás inscrito en cursos este ciclo."
                count={report?.courses.length}
              >
                {report?.courses.map((course) => {
                  const left = pendingByCourse.get(course.id) ?? 0;
                  return (
                    <li key={course.id} className="flex items-center gap-3 px-4 py-3">
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white"
                        style={{ backgroundColor: course.color ?? '#a1a1aa' }}
                      >
                        <BookOpen className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-zinc-900">{course.subject}</span>
                        <span className="block truncate text-xs text-zinc-500">
                          {course.teacher}
                          {left > 0 && <span className="text-blue-700"> · {left} por entregar</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs">
                        {withheld ? (
                          <span className="font-medium text-amber-700">Pendiente</span>
                        ) : course.percent === null ? (
                          <span className="text-zinc-400">Sin notas</span>
                        ) : (
                          <span
                            className={cn(
                              'text-sm font-semibold tabular-nums',
                              course.percent < passing ? 'text-red-600' : 'text-emerald-700',
                            )}
                          >
                            {formatScore(Math.round(course.percent))}%
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </Section>

              <Section
                title="Próximas clases en línea"
                action={<SeeAll to="/meetings">Reuniones</SeeAll>}
                empty="No hay reuniones programadas."
                count={meetings.length}
              >
                {meetings.map((meeting) => {
                  const live = new Date(meeting.startsAt).getTime() <= now;
                  return (
                    <li key={meeting.id}>
                      <Link to="/meetings" className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                        {live ? (
                          <Video className="size-4 shrink-0 text-emerald-600" />
                        ) : (
                          <CalendarClock className="size-4 shrink-0 text-zinc-400" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-zinc-900">{meeting.title}</span>
                          <span className="block truncate text-xs text-zinc-500">
                            {meeting.course?.subject ?? 'Todo el colegio'} · {live ? 'En curso' : formatDateTime(meeting.startsAt)}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-zinc-300" />
                      </Link>
                    </li>
                  );
                })}
              </Section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
