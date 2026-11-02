import { Link, Navigate } from 'react-router';
import { BookOpen, ChevronRight, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMyCourses } from '../hooks';

/** Lista de cursos del docente. Con un solo curso entra directo a su hoja. */
export function GradebookIndexPage() {
  const { data: courses, isLoading, isError, error } = useMyCourses();

  if (courses?.length === 1) return <Navigate to={`/courses/${courses[0].id}/gradebook`} replace />;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Cuadro de notas</h1>
      <p className="mt-1 text-sm text-zinc-500">Elige un curso para ver y editar sus notas.</p>

      <div className="mt-6 space-y-2">
        {isLoading && Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-16 w-full rounded-lg" />)}
        {isError && <p className="text-sm text-red-600">{error.message}</p>}
        {courses?.length === 0 && <p className="text-sm text-zinc-500">No tienes cursos asignados en el ciclo activo.</p>}
        {courses?.map((course) => (
          <Link
            key={course.id}
            to={`/courses/${course.id}/gradebook`}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 shadow-xs transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          >
            <span className="flex size-9 items-center justify-center rounded-md text-white" style={{ backgroundColor: course.color ?? '#3f3f46' }}>
              <BookOpen className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-zinc-900">{course.name}</span>
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <Users className="size-3" /> {course.studentCount} estudiantes
              </span>
            </span>
            <ChevronRight className="size-4 text-zinc-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}
