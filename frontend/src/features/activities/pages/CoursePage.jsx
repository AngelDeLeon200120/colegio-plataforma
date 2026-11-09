import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AlertTriangle, ChevronRight, ClipboardList, Plus, Table2, Users, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMyCourses } from '@/features/gradebook/hooks';
import { useMeetings, useMeetingsLive } from '@/features/meetings/hooks';
import { MeetingDialog } from '@/features/meetings/MeetingDialog';
import { MeetingList, meetingPhase } from '@/features/meetings/MeetingList';
import { cn } from '@/lib/cn';
import { ActivityFormDialog } from '../components/ActivityFormDialog';
import { ActivityRow } from '../components/ActivityRow';
import { useTeacherActivities } from '../hooks';

const TABS = [
  { id: 'work', label: 'Trabajo de clase', icon: ClipboardList },
  { id: 'meetings', label: 'Reuniones', icon: Video },
];

const STATUS_GROUPS = [
  { status: 'PUBLISHED', title: 'Publicadas' },
  { status: 'DRAFT', title: 'Borradores' },
  { status: 'CLOSED', title: 'Cerradas' },
];

/** Un curso estilo Classroom: sus actividades y sus reuniones virtuales en un solo lugar. */
export function CoursePage() {
  const { courseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'meetings' ? 'meetings' : 'work';
  const [form, setForm] = useState(null);
  const [meetingDialog, setMeetingDialog] = useState(null);

  const { data: courses = [], isLoading: loadingCourses } = useMyCourses();
  const course = courses.find((item) => String(item.id) === courseId);
  const activities = useTeacherActivities({ courseId });
  const meetings = useMeetings(courseId);
  useMeetingsLive();

  const color = course?.color ?? '#1a73e8';
  const [section, subject] = course?.name.includes(' · ') ? course.name.split(' · ') : [null, course?.name];
  const upcomingMeetings = (meetings.data?.meetings ?? []).filter((meeting) => ['live', 'upcoming'].includes(meetingPhase(meeting)));
  const list = activities.data ?? [];

  if (!loadingCourses && !course) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <AlertTriangle className="size-8 text-amber-500" />
        <p className="text-sm text-zinc-600">No encontramos este curso entre tus cursos del ciclo activo.</p>
        <Link to="/courses" className="text-sm font-medium text-brand-700 hover:underline">
          Volver a Mis cursos
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <nav className="mb-3 flex items-center gap-1 text-xs text-zinc-500" aria-label="Ruta">
          <Link to="/courses" className="hover:text-zinc-900">
            Mis cursos
          </Link>
          <ChevronRight className="size-3" />
          <span>{course?.name ?? '…'}</span>
        </nav>

        {course ? (
          <div className="relative overflow-hidden rounded-lg px-6 pt-10 pb-6 text-white" style={{ backgroundColor: color }}>
            <h1 className="text-3xl font-normal">{subject}</h1>
            {section && <p className="mt-1 text-lg text-white/90">{section}</p>}
            <p className="mt-3 flex items-center gap-1.5 text-sm text-white/90">
              <Users className="size-4" /> {course.studentCount} estudiantes
            </p>
            <Link
              to={`/courses/${course.id}/gradebook`}
              className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/30"
            >
              <Table2 className="size-4" /> Cuadro de notas
            </Link>
          </div>
        ) : (
          <Skeleton className="h-40 w-full rounded-lg" />
        )}

        <div className="mt-4 flex border-b border-zinc-200" role="tablist" aria-label="Secciones del curso">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setSearchParams(item.id === 'work' ? {} : { tab: item.id })}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-4 px-4 py-3 text-sm font-medium',
                tab === item.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-zinc-600 hover:bg-zinc-50',
              )}
            >
              <item.icon className="size-4" /> {item.label}
              {item.id === 'meetings' && upcomingMeetings.length > 0 && (
                <span className="rounded-full bg-violet-100 px-1.5 text-[11px] text-violet-800">{upcomingMeetings.length}</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'work' ? (
          <div className="mt-5 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-zinc-500">Actividades de este curso: crea, publica y revisa entregas.</p>
              <Button variant="primary" onClick={() => setForm({ activity: null })} disabled={!course}>
                <Plus className="size-4" /> Nueva actividad
              </Button>
            </div>
            {activities.isError && <p className="text-sm text-red-600">{activities.error.message}</p>}
            {activities.isLoading && <Skeleton className="h-40 w-full rounded-lg" />}
            {activities.data && list.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-300 py-12 text-center">
                <ClipboardList className="size-8 text-zinc-300" />
                <p className="text-sm text-zinc-500">Este curso todavía no tiene actividades.</p>
              </div>
            )}
            {STATUS_GROUPS.map((group) => {
              const items = list.filter((activity) => activity.status === group.status);
              if (!items.length) return null;
              return (
                <section key={group.status}>
                  <h2 className="mb-2 flex items-baseline gap-2 border-b border-zinc-200 pb-2 text-lg font-normal" style={{ color }}>
                    {group.title} <span className="text-xs text-zinc-400 tabular-nums">{items.length}</span>
                  </h2>
                  <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
                    {items.map((activity) => (
                      <ActivityRow key={activity.id} activity={activity} onEdit={(item) => setForm({ activity: item })} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-zinc-500">Cada reunión de esta clase tiene su propio código.</p>
              <Button variant="primary" onClick={() => setMeetingDialog({ meeting: null })} disabled={!course}>
                <Plus className="size-4" /> Programar reunión
              </Button>
            </div>
            {meetings.isLoading && <Skeleton className="h-32 w-full rounded-lg" />}
            {meetings.data && (
              <MeetingList meetings={upcomingMeetings} onEdit={(meeting) => setMeetingDialog({ meeting })} emptyText="No hay reuniones próximas para esta clase." />
            )}
            <Link to={`/meetings?course=${courseId}`} className="inline-block text-sm font-medium text-brand-700 hover:underline">
              Ver todas las reuniones, también las anteriores
            </Link>
          </div>
        )}
      </div>

      {form && course && (
        <ActivityFormDialog key={form.activity?.id ?? 'new'} activity={form.activity} courses={courses} defaultCourseId={course.id} onClose={() => setForm(null)} />
      )}
      {meetingDialog && course && (
        <MeetingDialog key={meetingDialog.meeting?.id ?? 'new'} meeting={meetingDialog.meeting} courses={[course]} defaultCourseId={course.id} onClose={() => setMeetingDialog(null)} />
      )}
    </div>
  );
}
