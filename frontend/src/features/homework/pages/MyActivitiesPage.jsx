import { Link, useSearchParams } from 'react-router';
import { AlertTriangle, ChevronRight, ClipboardList, Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatScore } from '@/lib/format';
import { StatusBadge } from '@/features/submissions/components/StatusBadge';
import { StudentSwitcher } from '../components/StudentSwitcher';
import { useHomeworkLiveUpdates, useMyActivities, useViewedStudent } from '../hooks';
import { ACTIVITY_TYPES, GROUPS, dueLabel, groupOf } from '../model';

const TONES = { danger: 'text-red-600', warning: 'text-amber-700', muted: 'text-zinc-500' };

function ActivityRow({ activity, studentQuery }) {
  const due = dueLabel(activity.dueAt);
  const { status, score } = activity.submission;
  const showDue = status === 'PENDING' || status === 'REJECTED';

  return (
    <li>
      <Link
        to={`/my/activities/${activity.id}${studentQuery}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: activity.subject.color ?? "#1a73e8" }} aria-hidden>
          <ClipboardList className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-900">{activity.title}</span>
          <span className="block truncate text-xs text-zinc-500">
            {activity.subject.name} · {ACTIVITY_TYPES[activity.type]} · {activity.unit.name}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {status === 'APPROVED' && activity.submission.scoreWithheld ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 ring-inset">Nota pendiente</span>
          ) : status === 'APPROVED' && score !== null ? (
            <span className="text-sm font-semibold text-emerald-700 tabular-nums">
              {formatScore(score)}
              <span className="font-normal text-zinc-400">/{formatScore(activity.maxScore)}</span>
            </span>
          ) : (
            <StatusBadge status={status} />
          )}
          {showDue && <span className={cn('text-xs', TONES[due.tone])}>{due.text}</span>}
        </span>
        <ChevronRight className="size-4 shrink-0 text-zinc-300" />
      </Link>
    </li>
  );
}

export function MyActivitiesPage() {
  const { isParent, children, studentId, selectStudent } = useViewedStudent();
  const missingChild = isParent && !studentId;
  const { data, isLoading, isError, error } = useMyActivities(studentId, { enabled: !missingChild });
  useHomeworkLiveUpdates();

  const studentQuery = isParent && studentId ? `?student=${studentId}` : '';
  // Filtro por curso (materia): las actividades se ven agrupadas por la clase a la que pertenecen
  const [searchParams, setSearchParams] = useSearchParams();
  const courses = [
    ...new Map((data?.activities ?? []).map((activity) => [String(activity.course?.id), { id: String(activity.course?.id), ...activity.subject }])).values(),
  ];
  // Si el curso del filtro no es de este estudiante (p. ej. al cambiar de hijo), se muestran todos
  const requestedCourse = searchParams.get('course') ?? '';
  const courseFilter = courses.some((course) => course.id === requestedCourse) ? requestedCourse : '';
  const visible = (data?.activities ?? []).filter((activity) => !courseFilter || String(activity.course?.id) === courseFilter);
  const pickCourse = (id) =>
    setSearchParams((params) => {
      if (id) params.set('course', id);
      else params.delete('course');
      return params;
    });
  const groups = GROUPS.map((group) => ({
    ...group,
    items: visible.filter((activity) => groupOf(activity) === group.id),
  })).filter((group) => group.items.length);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-normal text-zinc-900">
            {isParent ? `Tareas de ${data?.student.firstName ?? '…'}` : 'Mis tareas'}
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {isParent ? 'Sigue sus entregas, correcciones y calificaciones.' : 'Lo que tienes pendiente, en revisión y calificado.'}
          </p>
        </div>
        <StudentSwitcher students={children} studentId={studentId} onChange={selectStudent} />
      </header>

      {courses.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Curso">
          {[{ id: '', name: 'Todos los cursos', color: null }, ...courses].map((course) => (
            <button
              key={course.id || 'all'}
              type="button"
              role="tab"
              aria-selected={courseFilter === course.id}
              onClick={() => pickCourse(course.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                courseFilter === course.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100',
              )}
            >
              {course.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: course.color }} />}
              {course.name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {missingChild && <p className="text-sm text-zinc-500">Tu cuenta aún no está vinculada a ningún estudiante. Contacta a la administración del colegio.</p>}
        {isError && (
          <p className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="size-4" /> {error.message}
          </p>
        )}
        {isLoading && !missingChild && (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        )}
        {data && groups.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Inbox className="size-8 text-zinc-300" />
            <p className="text-sm text-zinc-500">No hay actividades publicadas por ahora.</p>
          </div>
        )}

        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`group-${group.id}`}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 id={`group-${group.id}`} className={cn('text-sm font-semibold', group.id === 'attention' ? 'text-amber-800' : 'text-zinc-900')}>
                {group.title}
              </h2>
              <span className="text-xs text-zinc-400 tabular-nums">{group.items.length}</span>
            </div>
            <ul
              className={cn(
                'divide-y divide-zinc-100 overflow-hidden rounded-lg border bg-white shadow-xs',
                group.id === 'attention' ? 'border-amber-200' : 'border-zinc-200',
              )}
            >
              {group.items.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} studentQuery={studentQuery} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
