import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, ExternalLink, KeyRound, Plus, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useMyCourses } from '@/features/gradebook/hooks';
import { cn } from '@/lib/cn';
import { useFindByCode, useMeetings, useMeetingsLive } from './hooks';
import { MeetingDialog } from './MeetingDialog';
import { CodeBadge, MeetingList, meetingPhase } from './MeetingList';
import { longDate, timeFormat } from '@/features/calendar/model';

const TABS = [
  { id: 'upcoming', label: 'Próximas' },
  { id: 'past', label: 'Anteriores' },
];

// Guiones "raros" (los que ponen WhatsApp, Word o el teléfono) y espacios: no forman parte del código
const DASHES = /[‐-―−﹣－]/g;

/** Lo que se pegó o escribió → el código. De "Código MAT-3ROB-S8YPCZ" toma solo el código. */
export function normalizeCode(text) {
  const clean = String(text ?? '').normalize('NFKC').replace(DASHES, '-').toUpperCase();
  const match = clean.match(/[A-Z0-9]{2,6}-[A-Z0-9]{2,6}-[A-Z0-9]{4,8}/);
  return (match ? match[0] : clean.replace(/[^A-Z0-9-]/g, '')).slice(0, 20);
}

/** La reunión encontrada: se abre con un clic en su botón (el navegador no bloquea esa pestaña). */
function FoundMeeting({ meeting, onClose }) {
  const phase = meetingPhase(meeting);
  return (
    <div className="order-last flex basis-full flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900">{meeting.title}</p>
        <p className="text-xs text-zinc-600">
          {meeting.course.name} · {longDate.format(new Date(meeting.startsAt))} · {timeFormat.format(new Date(meeting.startsAt))}
          {phase === 'past' && ' · ya terminó'}
          {phase === 'cancelled' && ' · cancelada'}
        </p>
      </div>
      <CodeBadge code={meeting.code} />
      {phase !== 'cancelled' && (
        <a
          href={meeting.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
        >
          <ExternalLink className="size-4" /> Abrir reunión
        </a>
      )}
      <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1 text-zinc-500 hover:bg-white">
        <X className="size-4" />
      </button>
    </div>
  );
}

function JoinByCode() {
  const [code, setCode] = useState('');
  const [found, setFound] = useState(null);
  const find = useFindByCode();
  const join = (event) => {
    event.preventDefault();
    if (code.length < 4) return;
    setFound(null);
    find.mutate(code, { onSuccess: setFound });
  };
  return (
    <>
      <JoinForm code={code} setCode={setCode} find={find} join={join} />
      {found && <FoundMeeting meeting={found} onClose={() => setFound(null)} />}
    </>
  );
}

function JoinForm({ code, setCode, find, join }) {
  return (
    <form onSubmit={join} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label className="relative">
          <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={code}
            onChange={(event) => {
              find.reset();
              setCode(normalizeCode(event.target.value));
            }}
            onPaste={(event) => {
              // Lo pegado (aunque traiga más texto) se reduce al código; si llega vacío, el navegador pega como siempre
              const pasted = event.clipboardData?.getData('text') ?? '';
              if (!pasted.trim()) return;
              event.preventDefault();
              find.reset();
              setCode(normalizeCode(pasted));
            }}
            placeholder="Escribe un código"
            aria-label="Código de reunión"
            autoComplete="off"
            spellCheck={false}
            className="h-9 w-52 rounded-full border border-zinc-300 bg-white pr-3 pl-9 font-mono text-sm tracking-wider uppercase placeholder:font-sans placeholder:tracking-normal placeholder:normal-case focus:border-brand-600 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
        </label>
        <Button type="submit" disabled={code.length < 4} loading={find.isPending}>
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
  const { data: courses = [], isSuccess: coursesLoaded } = useMyCourses({ enabled: canSchedule });
  // Un docente sin cursos no tiene a qué clase programarle: se le explica en lugar de dejar el botón apagado sin razón
  const noCourses = canSchedule && coursesLoaded && courses.length === 0;

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
        {noCourses && (
          <p className="basis-full rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            Para programar reuniones necesitas un curso asignado. Pide a la administración que te asigne uno en Estructura académica.
          </p>
        )}
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
            emptyText={
              tab !== 'upcoming'
                ? 'Aún no hay reuniones anteriores.'
                : noCourses
                  ? 'No tienes clases asignadas. Si te pasan un código, escríbelo arriba para unirte.'
                  : 'No hay reuniones programadas.'
            }
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
