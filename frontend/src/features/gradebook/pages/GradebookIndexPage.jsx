import { Navigate } from 'react-router';
import { Skeleton } from '@/components/ui/Skeleton';
import { CourseTile } from '@/features/activities/components/CourseTile';
import { useMyCourses } from '../hooks';

/** Lista de cursos del docente. Con un solo curso entra directo a su hoja. */
export function GradebookIndexPage() {
  const { data: courses, isLoading, isError, error } = useMyCourses();

  if (courses?.length === 1) return <Navigate to={`/courses/${courses[0].id}/gradebook`} replace />;

  return (
    <div className="w-full overflow-y-auto px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-normal text-zinc-900">Cuadro de notas</h1>
      <p className="mt-1 text-sm text-zinc-500">Elige un curso para ver y editar sus notas.</p>

      <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
        {isLoading && Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-44 rounded-lg" />)}
        {isError && <p className="text-sm text-red-600">{error.message}</p>}
        {courses?.length === 0 && <p className="text-sm text-zinc-500">No tienes cursos asignados en el ciclo activo.</p>}
        {courses?.map((course) => (
          <CourseTile key={course.id} course={course} to={`/courses/${course.id}/gradebook`} />
        ))}
      </div>
    </div>
  );
}
