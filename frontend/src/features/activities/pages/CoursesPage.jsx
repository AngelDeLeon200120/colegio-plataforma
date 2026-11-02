import { Link } from 'react-router';
import { BookOpen, ClipboardCheck, Table2, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMyCourses } from '@/features/gradebook/hooks';
import { useTeacherActivities } from '../hooks';

const linkClass =
  'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 shadow-xs transition-colors hover:bg-zinc-50';

export function CoursesPage() {
  const { data: courses, isLoading, isError, error } = useMyCourses();
  const { data: activities = [] } = useTeacherActivities();

  const toReviewByCourse = activities.reduce((map, activity) => {
    map[activity.course.id] = (map[activity.course.id] ?? 0) + activity.progress.submitted;
    return map;
  }, {});

  return (
    <div className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6 sm:px-6">
      <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Mis cursos</h1>
      <p className="mt-0.5 text-sm text-zinc-500">Cursos del ciclo activo.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {isLoading && Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-36 rounded-xl" />)}
        {isError && <p className="text-sm text-red-600">{error.message}</p>}
        {courses?.length === 0 && <p className="text-sm text-zinc-500">No tienes cursos asignados en el ciclo activo.</p>}
        {courses?.map((course) => (
          <article key={course.id} className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: course.color ?? '#3f3f46' }}>
                <BookOpen className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-zinc-900">{course.name}</h2>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                  <Users className="size-3" /> {course.studentCount} estudiantes
                  {toReviewByCourse[course.id] > 0 && (
                    <span className="ml-1 rounded-full bg-blue-50 px-1.5 font-semibold text-blue-700">{toReviewByCourse[course.id]} por revisar</span>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Link to={`/activities?course=${course.id}`} className={linkClass}>
                <ClipboardCheck className="size-3.5" /> Actividades
              </Link>
              <Link to={`/courses/${course.id}/gradebook`} className={linkClass}>
                <Table2 className="size-3.5" /> Cuadro de notas
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
