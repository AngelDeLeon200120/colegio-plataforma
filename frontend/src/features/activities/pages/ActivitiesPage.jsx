import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, ClipboardList, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { useMyCourses } from '@/features/gradebook/hooks';
import { ActivityFormDialog } from '../components/ActivityFormDialog';
import { ActivityRow } from '../components/ActivityRow';
import { useTeacherActivities } from '../hooks';

const TABS = [
  { value: '', label: 'Todas' },
  { value: 'DRAFT', label: 'Borradores' },
  { value: 'PUBLISHED', label: 'Publicadas' },
  { value: 'CLOSED', label: 'Cerradas' },
];

export function ActivitiesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const courseId = searchParams.get('course') ?? '';
  const status = searchParams.get('status') ?? '';
  const [form, setForm] = useState(null); // { activity } | { activity: null }

  const { data: courses = [] } = useMyCourses();
  const { data: activities, isLoading, isError, error } = useTeacherActivities({ courseId: courseId || undefined, status: status || undefined });

  const setFilter = (key, value) =>
    setSearchParams((params) => {
      if (value) params.set(key, value);
      else params.delete(key);
      return params;
    });

  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Actividades</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Crea tareas por curso, publícalas para su sección y sigue sus entregas.</p>
        </div>
        <Button variant="primary" onClick={() => setForm({ activity: null })} disabled={!courses.length}>
          <Plus className="size-3.5" /> Nueva actividad
        </Button>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Estado" className="flex gap-1 rounded-lg bg-zinc-100 p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={status === tab.value}
              onClick={() => setFilter('status', tab.value)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                status === tab.value ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {courses.length > 1 && (
          <select
            value={courseId}
            onChange={(event) => setFilter('course', event.target.value)}
            aria-label="Curso"
            className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm shadow-xs focus:ring-2 focus:ring-zinc-200 focus:outline-none"
          >
            <option value="">Todos los cursos</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-4">
        {isError && (
          <p className="flex items-center gap-2 text-sm text-red-600">
            <AlertTriangle className="size-4" /> {error.message}
          </p>
        )}
        {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
        {activities && activities.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 py-14 text-center">
            <ClipboardList className="size-8 text-zinc-300" />
            <p className="text-sm text-zinc-500">No hay actividades con este filtro.</p>
            <Button size="sm" onClick={() => setForm({ activity: null })} disabled={!courses.length}>
              <Plus className="size-3.5" /> Crear la primera
            </Button>
          </div>
        )}
        {activities?.length > 0 && (
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white shadow-xs">
            {activities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} onEdit={(item) => setForm({ activity: item })} />
            ))}
          </ul>
        )}
      </div>

      {form && (
        <ActivityFormDialog
          key={form.activity?.id ?? 'new'}
          activity={form.activity}
          courses={courses}
          defaultCourseId={courseId || undefined}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}
