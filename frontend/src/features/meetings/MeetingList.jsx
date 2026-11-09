import { useEffect, useState } from 'react';
import { Ban, Copy, MoreVertical, Pencil, Video } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { longDate, timeFormat } from '@/features/calendar/model';
import { cn } from '@/lib/cn';
import { useCancelMeeting } from './hooks';

const JOIN_EARLY_MS = 15 * 60_000;

/** "En curso" desde 15 minutos antes hasta que termina. */
export function meetingPhase(meeting, now = Date.now()) {
  if (meeting.status === 'CANCELLED') return 'cancelled';
  const start = new Date(meeting.startsAt).getTime();
  const end = new Date(meeting.endsAt).getTime();
  if (now > end) return 'past';
  if (now >= start - JOIN_EARLY_MS) return 'live';
  return 'upcoming';
}

function CodeBadge({ code }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(code);
        setCopied(true);
      }}
      className="inline-flex items-center gap-1.5 rounded-md bg-violet-50 px-2 py-1 font-mono text-xs font-semibold tracking-wider text-violet-800 hover:bg-violet-100"
      title="Copiar código"
    >
      {code} <Copy className="size-3" /> {copied && <span className="font-sans font-medium tracking-normal">Copiado</span>}
    </button>
  );
}

function MeetingRow({ meeting, focused, onEdit }) {
  const cancel = useCancelMeeting();
  const [menuOpen, setMenuOpen] = useState(false);
  const phase = meetingPhase(meeting);
  const start = new Date(meeting.startsAt);
  const end = new Date(meeting.endsAt);

  return (
    <li
      id={`meeting-${meeting.id}`}
      className={cn('flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap', focused && 'bg-violet-50/60', phase === 'cancelled' && 'opacity-60')}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: meeting.course.color ?? '#7c3aed' }} aria-hidden>
        <Video className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('flex items-center gap-2 text-sm font-medium text-zinc-900', phase === 'cancelled' && 'line-through')}>
          <span className="truncate">{meeting.title}</span>
          {phase === 'live' && (
            <Badge tone="red" dot>
              En curso
            </Badge>
          )}
          {phase === 'cancelled' && <Badge>Cancelada</Badge>}
        </p>
        <p className="truncate text-xs text-zinc-500">
          {meeting.course.name} · {timeFormat.format(start)} – {timeFormat.format(end)} · {meeting.course.teacher}
        </p>
        {meeting.description && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600">{meeting.description}</p>}
      </div>
      <CodeBadge code={meeting.code} />
      {phase !== 'cancelled' && phase !== 'past' && (
        <a href={meeting.joinUrl} target="_blank" rel="noopener noreferrer">
          <Button variant={phase === 'live' ? 'primary' : 'secondary'} size="sm">
            <Video className="size-3.5" /> Unirse
          </Button>
        </a>
      )}
      {meeting.canManage && phase !== 'cancelled' && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex size-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100"
            aria-label="Opciones de la reunión"
            aria-expanded={menuOpen}
          >
            <MoreVertical className="size-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 shadow-lg" role="menu">
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(meeting);
                }}
              >
                <Pencil className="size-4" /> Editar
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  setMenuOpen(false);
                  if (window.confirm(`¿Cancelar «${meeting.title}»? Se avisará a la clase.`)) cancel.mutate(meeting.id);
                }}
              >
                <Ban className="size-4" /> Cancelar reunión
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Reuniones agrupadas por día. */
export function MeetingList({ meetings, focusId, onEdit, emptyText }) {
  useEffect(() => {
    if (focusId) document.getElementById(`meeting-${focusId}`)?.scrollIntoView({ block: 'center' });
  }, [focusId, meetings.length]);

  if (!meetings.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white py-12 text-center">
        <Video className="size-8 text-zinc-300" />
        <p className="text-sm text-zinc-500">{emptyText}</p>
      </div>
    );
  }

  const groups = [];
  for (const meeting of meetings) {
    const label = longDate.format(new Date(meeting.startsAt));
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(meeting);
    else groups.push({ label, items: [meeting] });
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.label}>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{group.label}</h3>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-300 bg-white">
            {group.items.map((meeting) => (
              <MeetingRow key={meeting.id} meeting={meeting} focused={String(meeting.id) === String(focusId)} onEdit={onEdit} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
