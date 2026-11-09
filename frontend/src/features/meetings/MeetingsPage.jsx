import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, KeyRound, Plus, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMyCourses } from '@/features/gradebook/hooks';
import { cn } from '@/lib/cn';
import { useFindByCode, useMeetings, useMeetingsLive } from './hooks';
import { MeetingDialog } from './MeetingDialog';
import { MeetingList, meetingPhase } from './MeetingList';

const TABS = [
  { id: 'upcoming', label: 'Próximas' },
  { id: 'past', label: 'Anteriores' },
];

function JoinByCode() {
  const [code, setCode] = useState('');
  const find = useFindByCode();
  const join = (event) => {
    event.preventDefault();
    if (code.trim().length < 4) return;
    // La pestaña se abre antes de la consulta para que el navegador no la bloquee
    const tab = window.open('about:blank', '_blank');
    find.mutate(code, {
      onSuccess: (meeting) => {
        if (tab) {
          tab.opener = null;
          tab.location.replace(meeting.joinUrl);
        }
        setCode('');
      },
      onError: () => tab?.close(),
    });
  };
  return (
    <form onSubmit={join} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="relative">
          <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="Escribe un código"
            aria-label="Código de reunión"
            maxLength={20}
            className="h-9 w-52 rounded-full border border-zinc-300 bg-white pr-3 pl-9 font-mono text-sm tracking-wider uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
        </label>
        <Button type="submit" disabled={code.trim().length < 4} loading={find.isPending}>
          Unirse
        </Button>
      </div>
      {find.error && <p className="text-xs text-red-600">{find.error.message}</p>}
    </form>
  );
}

export function MeetingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const courseFilter = searchParams.get('course') ?? '';
  const [tab, setTab] = useState('upcoming');
  const [dialog, setDialog] = useState(null); // { meeting } | { meeting: null }
  const { data, isLoading, isError, error } = useMeetings();
  useMeetingsLive();
  const canSchedule = Boolean(data?.canSchedule);
  const { data: courses = [] } = useMyCourses({ enabled: canSchedule });

  const all = data?.meetings ?? [];
  const classes = [...new Map(all.map((meeting) => [meeting.course.id, meeting.course])).values()];
  const filtered = all.filter((meeting) => !courseFilter || String(meeting.course.id) === courseFilter);
  const upcoming = filtered.filter((meeting) => ['live', 'upcoming'].includes(meetingPhase(meeting)) || (meetingPhase(meeting) === 'cancelled' && new Date(meeting.endsAt) > new Date()));
  const past = filtered.filter((meeting) => !upcoming.includes(meeting)).reverse();
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-normal text-zinc-900">
            <Video className="size-6 text-violet-600" /> Reuniones virtuales
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">Cada clase tiene sus propias reuniones con un código distinto.</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <JoinByCode />
          {canSchedule && (
            <Button variant="primary" onClick={() => setDialog({ meeting: null })} disabled={!courses.length}>
              <Plus className="size-4" /> Programar
            </Button>
          )}
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Periodo" className="flex gap-1.5">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                tab === item.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100',
              )}
            >
              {item.label} {item.id === 'upcoming' && upcoming.length > 0 && `(${upcoming.length})`}
            </button>
          ))}
        </div>
        {classes.length > 1 && (
          <select
            value={courseFilter}
            onChange={(event) =>
              setSearchParams((params) => {
                if (event.target.value) params.set('course', event.target.value);
                else params.delete('course');
                return params;
              })
            }
            aria-label="Clase"
            className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm shadow-xs focus:ring-2 focus:ring-zinc-200 focus:outline-none"
          >
            <option value="">Todas las clases</option>
            {classes.map((course) => (
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
        {isLoading && <Skeleton className="h-40 w-full rounded-lg" />}
        {data && (
          <MeetingList
            meetings={shown}
            focusId={focusId}
            onEdit={(meeting) => setDialog({ meeting })}
            emptyText={tab === 'upcoming' ? 'No hay reuniones programadas.' : 'Aún no hay reuniones anteriores.'}
          />
        )}
      </div>

      {dialog && (
        <MeetingDialog
          key={dialog.meeting?.id ?? 'new'}
          meeting={dialog.meeting}
          courses={courses}
          defaultCourseId={courseFilter || undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
