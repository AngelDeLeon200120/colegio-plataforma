import { useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, CalendarClock, ChevronRight, Inbox, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/features/auth/store';
import { useMyCourses } from '@/features/gradebook/hooks';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { ActivityFormDialog } from '../components/ActivityFormDialog';
import { useTeacherActivities } from '../hooks';

const WEEK_MS = 7 * 86_400_000;

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function StatCard({ icon: Icon, label, value, to, highlight }) {
  return (
    <Link
      to={to}
      className={cn(
        'rounded-xl border bg-white p-4 shadow-xs transition-colors hover:bg-zinc-50',
        highlight ? 'border-blue-200' : 'border-zinc-200',
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        <Icon className="size-3.5" /> {label}
      </p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', highlight ? 'text-blue-700' : 'text-zinc-900')}>{value}</p>
    </Link>
  );
}

function Section({ title, empty, children, count }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-zinc-900">{title}</h2>
      {count ? (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">{children}</ul>
      ) : (
        <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500">{empty}</p>
      )}
    </section>
  );
}

/** Inicio del docente: qué revisar ahora y qué vence pronto. */
export function DashboardPage() {
  const user = useAuthStore((state) => state.user);
  const { data: courses = [], isLoading: loadingCourses } = useMyCourses();
  const { data: activities = [], isLoading } = useTeacherActivities();
  const [creating, setCreating] = useState(false);

  const published = activities.filter((activity) => activity.status === 'PUBLISHED');
  const toReview = published.filter((activity) => activity.progress.submitted > 0).sort((a, b) => b.progress.submitted - a.progress.submitted);
  const totalToReview = toReview.reduce((sum, activity) => sum + activity.progress.submitted, 0);
  const inCorrection = published.reduce((sum, activity) => sum + activity.progress.rejected, 0);
  const now = Date.now();
  const upcoming = published
    .filter((activity) => activity.dueAt && new Date(activity.dueAt).getTime() >= now && new Date(activity.dueAt).getTime() - now <= WEEK_MS)
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));

  return (
    <div className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
            {greeting()}, {user?.firstName}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">Esto es lo que tienes pendiente hoy.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)} disabled={!courses.length}>
          <Plus className="size-3.5" /> Nueva actividad
        </Button>
      </header>

      {isLoading || loadingCourses ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <StatCard icon={Inbox} label="Entregas por revisar" value={totalToReview} to="/activities?status=PUBLISHED" highlight={totalToReview > 0} />
            <StatCard icon={RotateCcw} label="Esperando corrección" value={inCorrection} to="/activities?status=PUBLISHED" />
            <StatCard icon={BookOpen} label="Cursos" value={courses.length} to="/courses" />
          </div>

          <div className="mt-6 space-y-6">
            <Section title="Por revisar" empty="No hay entregas esperando revisión. ¡Al día!" count={toReview.length}>
              {toReview.map((activity) => (
                <li key={activity.id}>
                  <Link to={`/activities/${activity.id}/review`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: activity.course.color ?? '#a1a1aa' }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-900">{activity.title}</span>
                      <span className="block text-xs text-zinc-500">{activity.course.name}</span>
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 tabular-nums">
                      {activity.progress.submitted} por revisar
                    </span>
                    <ChevronRight className="size-4 text-zinc-300" />
                  </Link>
                </li>
              ))}
            </Section>

            <Section title="Vencen en los próximos 7 días" empty="Nada vence esta semana." count={upcoming.length}>
              {upcoming.map((activity) => (
                <li key={activity.id}>
                  <Link to={`/activities/${activity.id}/review`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50">
                    <CalendarClock className="size-4 shrink-0 text-zinc-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-zinc-900">{activity.title}</span>
                      <span className="block text-xs text-zinc-500">
                        {activity.course.name} · vence {formatDateTime(activity.dueAt)}
                      </span>
                    </span>
                    <span className="text-xs text-zinc-500 tabular-nums">
                      {activity.progress.total - activity.progress.pending}/{activity.progress.total} entregadas
                    </span>
                    <ChevronRight className="size-4 text-zinc-300" />
                  </Link>
                </li>
              ))}
            </Section>
          </div>
        </>
      )}

      {creating && <ActivityFormDialog activity={null} courses={courses} onClose={() => setCreating(false)} />}
    </div>
  );
}
