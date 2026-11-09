import { Link } from 'react-router';
import { ClipboardCheck, Table2, Video } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMyCourses } from '@/features/gradebook/hooks';
import { useTeacherActivities } from '../hooks';
import { CourseTile } from '../components/CourseTile';

const iconLinkClass = 'flex size-10 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900';

export function CoursesPage() {
  const { data: courses, isLoading, isError, error } = useMyCourses();
  const { data: activities = [] } = useTeacherActivities();

  const toReviewByCourse = activities.reduce((map, activity) => {
    map[activity.course.id] = (map[activity.course.id] ?? 0) + activity.progress.submitted;
    return map;
  }, {});

  return (
    <div className="w-full overflow-y-auto px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-normal text-zinc-900">Mis cursos</h1>
      <p className="mt-0.5 text-sm text-zinc-500">Cursos del ciclo activo.</p>

      <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
        {isLoading && Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-56 rounded-lg" />)}
        {isError && <p className="text-sm text-red-600">{error.message}</p>}
        {courses?.length === 0 && <p className="text-sm text-zinc-500">No tienes cursos asignados en el ciclo activo.</p>}
        {courses?.map((course) => (
          <CourseTile
            key={course.id}
            course={course}
            to={`/courses/${course.id}`}
            badge={
              toReviewByCourse[course.id] > 0 && (
                <span className="w-fit rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                  {toReviewByCourse[course.id]} por revisar
                </span>
              )
            }
          >
            <Link to={`/courses/${course.id}`} className={`relative ${iconLinkClass}`} title="Actividades" aria-label="Actividades">
              <ClipboardCheck className="size-5" />
            </Link>
            <Link to={`/courses/${course.id}?tab=meetings`} className={`relative ${iconLinkClass}`} title="Reuniones" aria-label="Reuniones">
              <Video className="size-5" />
            </Link>
            <Link to={`/courses/${course.id}/gradebook`} className={`relative ${iconLinkClass}`} title="Cuadro de notas" aria-label="Cuadro de notas">
              <Table2 className="size-5" />
            </Link>
          </CourseTile>
        ))}
      </div>
    </div>
  );
}
