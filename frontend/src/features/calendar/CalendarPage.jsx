import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Copy, MapPin, Plus, Users, Video } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useAuthStore } from '@/features/auth/store';
import { cn } from '@/lib/cn';
import { EventDialog } from './EventDialog';
import { useAgenda, useCalendarLive } from './hooks';
import {
  ACTIVITY_COLOR,
  CATEGORY_LOOK,
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_HEIGHT,
  MEETING_COLOR,
  VIEWS,
  addDays,
  layoutDay,
  longDate,
  longDateTime,
  rangeTitle,
  sameDay,
  shiftAnchor,
  startOfDay,
  timeFormat,
  toEntries,
  touchesDay,
  visibleRange,
  weekdayShort,
} from './model';

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => DAY_START_HOUR + index);
const FILTERS = [
  { id: 'events', label: 'Eventos del colegio', color: CATEGORY_LOOK.GENERAL.color },
  { id: 'meetings', label: 'Reuniones virtuales', color: MEETING_COLOR },
  { id: 'activities', label: 'Entregas de tareas', color: ACTIVITY_COLOR },
];

function EntryChip({ entry, onOpen, compact }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(entry);
      }}
      title={entry.title}
      className={cn(
        'flex w-full min-w-0 items-center gap-1 rounded px-1.5 text-left text-xs font-medium text-white hover:brightness-95',
        compact ? 'h-5' : 'h-6',
        entry.kind === 'activity' && 'border-l-4 bg-white! text-zinc-800! ring-1 ring-zinc-200 ring-inset',
      )}
      style={entry.kind === 'activity' ? { borderLeftColor: entry.color } : { backgroundColor: entry.color }}
    >
      {!entry.allDay && entry.kind !== 'activity' && <span className="shrink-0 opacity-90">{timeFormat.format(entry.start)}</span>}
      <span className="truncate">{entry.title}</span>
    </button>
  );
}

/** Vista Día / Semana: columnas por día con franjas horarias, como Teams. */
function TimeGrid({ days, entries, canManage, onOpen, onCreate }) {
  const scroller = useRef(null);
  const today = new Date();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Al abrir, mostrar desde las 7:00
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = HOUR_HEIGHT * Math.max(0, 7 - DAY_START_HOUR);
  }, []);

  const allDayByDay = days.map((day) => entries.filter((entry) => touchesDay(entry, day) && (entry.allDay || entry.end - entry.start >= 86_400_000)));
  const timedByDay = days.map((day) =>
    layoutDay(entries.filter((entry) => !entry.allDay && entry.end - entry.start < 86_400_000 && touchesDay(entry, day))),
  );
  const columns = `68px repeat(${days.length}, minmax(${days.length > 1 ? 110 : 200}px, 1fr))`;

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
      <div className="min-w-fit">
        <div className="sticky top-0 z-20 grid border-b border-zinc-200 bg-white" style={{ gridTemplateColumns: columns }}>
          <div />
          {days.map((day) => {
            const isToday = sameDay(day, today);
            return (
              <div key={day.toISOString()} className="border-l border-zinc-200 px-2 py-2">
                <p className={cn('text-xs font-medium capitalize', isToday ? 'text-brand-700' : 'text-zinc-500')}>{weekdayShort.format(day)}</p>
                <p className={cn('text-2xl leading-none font-light', isToday ? 'text-brand-700' : 'text-zinc-800')}>
                  <span className={cn(isToday && 'border-b-2 border-brand-600')}>{day.getDate()}</span>
                </p>
              </div>
            );
          })}
          <div className="border-t border-zinc-200 py-1 pr-2 text-right text-[10px] whitespace-nowrap text-zinc-400">Todo el día</div>
          {allDayByDay.map((items, index) => (
            <div
              key={days[index].toISOString()}
              className={cn('min-h-8 space-y-0.5 border-t border-l border-zinc-200 p-0.5', canManage && 'cursor-pointer hover:bg-zinc-50')}
              onClick={() => canManage && onCreate({ start: days[index], end: days[index], allDay: true })}
            >
              {items.map((entry) => (
                <EntryChip key={entry.key} entry={entry} onOpen={onOpen} compact />
              ))}
            </div>
          ))}
        </div>

        <div className="relative grid" style={{ gridTemplateColumns: columns }}>
          <div>
            {HOURS.map((hour) => (
              <div key={hour} className="relative pr-2 text-right text-[11px] whitespace-nowrap text-zinc-400" style={{ height: HOUR_HEIGHT }}>
                <span className="relative -top-2">{timeFormat.format(new Date(2000, 0, 1, hour))}</span>
              </div>
            ))}
          </div>
          {days.map((day, dayIndex) => {
            const dayStart = startOfDay(day);
            const top = (date) => ((Math.max(date, dayStart.getTime() + DAY_START_HOUR * 3_600_000) - dayStart) / 3_600_000 - DAY_START_HOUR) * HOUR_HEIGHT;
            const showNow = sameDay(day, now) && now.getHours() >= DAY_START_HOUR && now.getHours() < DAY_END_HOUR;
            return (
              <div key={day.toISOString()} className="relative border-l border-zinc-200">
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: HOUR_HEIGHT }}
                    className={cn('border-b border-zinc-100', canManage && 'cursor-pointer hover:bg-brand-50/50')}
                    onClick={() => {
                      if (!canManage) return;
                      const start = new Date(dayStart);
                      start.setHours(hour);
                      onCreate({ start, end: new Date(start.getTime() + 3_600_000), allDay: false });
                    }}
                    aria-hidden
                  />
                ))}
                {timedByDay[dayIndex].map(({ entry, lane, lanes }) => {
                  const startTop = top(entry.start.getTime());
                  const height = Math.max(22, top(Math.min(entry.end.getTime(), dayStart.getTime() + DAY_END_HOUR * 3_600_000)) - startTop);
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => onOpen(entry)}
                      title={entry.title}
                      className={cn(
                        'absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-xs shadow-xs hover:shadow-md',
                        entry.kind === 'activity' ? 'bg-white text-zinc-800 ring-1 ring-zinc-200' : 'text-zinc-900',
                      )}
                      style={{
                        top: startTop,
                        height,
                        left: `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lanes}% - 4px)`,
                        borderLeftColor: entry.color,
                        ...(entry.kind !== 'activity' && { backgroundColor: `${entry.color}22` }),
                      }}
                    >
                      <span className="block truncate font-semibold">{entry.title}</span>
                      {height > 30 && (
                        <span className="block truncate text-[11px] text-zinc-600">
                          {timeFormat.format(entry.start)} – {timeFormat.format(entry.end)}
                        </span>
                      )}
                    </button>
                  );
                })}
                {showNow && (
                  <div className="pointer-events-none absolute right-0 left-0 z-10 flex items-center" style={{ top: top(now.getTime()) }}>
                    <span className="-ml-1 size-2 rounded-full bg-red-500" />
                    <span className="h-0.5 flex-1 bg-red-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ start, anchor, entries, canManage, onOpen, onCreate, onPickDay }) {
  const today = new Date();
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="grid grid-cols-7 border-b border-zinc-200">
        {days.slice(0, 7).map((day) => (
          <p key={day.toISOString()} className="px-2 py-1.5 text-xs font-medium text-zinc-500 capitalize">
            {weekdayShort.format(day)}
          </p>
        ))}
      </div>
      <div className="grid min-h-[540px] flex-1 grid-cols-7 grid-rows-6">
        {days.map((day) => {
          const items = entries.filter((entry) => touchesDay(entry, day));
          const outside = day.getMonth() !== anchor.getMonth();
          return (
            <div
              key={day.toISOString()}
              className={cn('min-w-0 border-r border-b border-zinc-200 p-1', outside && 'bg-zinc-50', canManage && 'cursor-pointer hover:bg-brand-50/40')}
              onClick={() => canManage && onCreate({ start: day, end: day, allDay: true })}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onPickDay(day);
                }}
                className={cn(
                  'mb-0.5 flex size-6 items-center justify-center rounded-full text-xs hover:bg-zinc-200',
                  sameDay(day, today) ? 'bg-brand-600 font-semibold text-white hover:bg-brand-700' : outside ? 'text-zinc-400' : 'text-zinc-700',
                )}
                aria-label={`Ver ${longDate.format(day)}`}
              >
                {day.getDate()}
              </button>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((entry) => (
                  <EntryChip key={entry.key} entry={entry} onOpen={onOpen} compact />
                ))}
                {items.length > 3 && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPickDay(day);
                    }}
                    className="px-1.5 text-[11px] font-medium text-zinc-600 hover:underline"
                  >
                    +{items.length - 3} más
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Detalle de una entrada: reunión (con su código), entrega o evento del colegio. */
function EntryDetails({ entry, canManage, onEdit, onClose }) {
  const role = useAuthStore((state) => state.user?.role);
  const [copied, setCopied] = useState(false);
  const { source } = entry;
  const when = entry.allDay
    ? sameDay(entry.start, entry.end) || entry.end - entry.start < 86_400_000
      ? longDate.format(entry.start)
      : `${longDate.format(entry.start)} – ${longDate.format(entry.end)}`
    : `${longDateTime.format(entry.start)} – ${timeFormat.format(entry.end)}`;
  const staff = role === 'TEACHER' || role === 'ADMIN';

  return (
    <Dialog
      open
      onClose={onClose}
      title={entry.kind === 'activity' ? source.title : entry.title}
      description={when}
      footer={
        <>
          {entry.kind === 'event' && canManage && (
            <Button className="mr-auto" onClick={onEdit}>
              Editar
            </Button>
          )}
          {entry.kind === 'activity' && (
            <Link to={staff ? `/courses/${source.course.id}` : `/my/activities/${source.id}`} className="mr-auto">
              <Button>
                <ClipboardList className="size-4" /> Ver actividad
              </Button>
            </Link>
          )}
          {entry.kind === 'meeting' && (
            <a href={source.joinUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="primary">
                <Video className="size-4" /> Unirse
              </Button>
            </a>
          )}
          <Button onClick={onClose}>Cerrar</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-zinc-700">
        <p className="flex items-center gap-2">
          <span className="size-3 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.kind === 'event' && (CATEGORY_LOOK[source.category]?.label ?? 'Evento')}
          {entry.kind === 'meeting' && `Reunión virtual · ${source.course.name}`}
          {entry.kind === 'activity' && `Fecha de entrega · ${source.course.subject}`}
        </p>
        {entry.kind === 'event' && (
          <>
            <p className="flex items-center gap-2">
              <Users className="size-4 text-zinc-400" /> {source.section ? `Solo ${source.section.name}` : 'Todo el colegio'}
            </p>
            {source.location && (
              <p className="flex items-center gap-2">
                <MapPin className="size-4 text-zinc-400" /> {source.location}
              </p>
            )}
            {source.description && <p className="whitespace-pre-wrap">{source.description}</p>}
          </>
        )}
        {entry.kind === 'meeting' && (
          <>
            <p>Docente: {source.course.teacher}</p>
            <div className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2">
              <span className="text-xs text-violet-700">Código</span>
              <code className="flex-1 font-mono text-base font-semibold tracking-wider text-violet-900">{source.code}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(source.code);
                  setCopied(true);
                }}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
              >
                <Copy className="size-3.5" /> {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            {source.description && <p className="whitespace-pre-wrap">{source.description}</p>}
          </>
        )}
        {entry.kind === 'activity' && <p>Vence: {longDateTime.format(entry.end)}</p>}
      </div>
    </Dialog>
  );
}

export function CalendarPage() {
  const [view, setView] = useState(() => (window.matchMedia('(min-width: 768px)').matches ? 'workweek' : 'day'));
  const [anchor, setAnchor] = useState(() => new Date());
  const [show, setShow] = useState({ events: true, meetings: true, activities: true });
  const [dialog, setDialog] = useState(null); // { type: 'create', defaults } | { type: 'edit', event } | { type: 'view', entry }
  useCalendarLive();

  const { start, days } = visibleRange(view, anchor);
  const range = useMemo(() => ({ from: start.toISOString(), to: addDays(start, days).toISOString() }), [start.getTime(), days]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, isError, error, isFetching } = useAgenda(range);
  const entries = useMemo(() => toEntries(data, show), [data, show]);
  const canManage = Boolean(data?.canManage);
  const dayList = view === 'month' ? [] : Array.from({ length: days }, (_, index) => addDays(start, index));

  const openCreate = (defaults) => setDialog({ type: 'create', defaults });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <CalendarDays className="size-6 text-brand-600" />
        <h1 className="mr-2 text-xl font-normal text-zinc-900">Calendario</h1>
        <Button size="sm" onClick={() => setAnchor(new Date())}>
          Hoy
        </Button>
        <div className="flex">
          <button type="button" onClick={() => setAnchor(shiftAnchor(view, anchor, -1))} className="flex size-8 items-center justify-center rounded-full hover:bg-zinc-100" aria-label="Anterior">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={() => setAnchor(shiftAnchor(view, anchor, 1))} className="flex size-8 items-center justify-center rounded-full hover:bg-zinc-100" aria-label="Siguiente">
            <ChevronRight className="size-5" />
          </button>
        </div>
        <p className="text-base font-medium text-zinc-800" aria-live="polite">
          {rangeTitle(view, anchor)}
        </p>
        {isFetching && <span className="size-2 animate-pulse rounded-full bg-brand-500" aria-label="Actualizando" />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Vista" className="flex rounded-full border border-zinc-300 p-0.5">
            {VIEWS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={view === item.id}
                onClick={() => setView(item.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap',
                  view === item.id ? 'bg-brand-50 text-brand-700' : 'text-zinc-600 hover:bg-zinc-100',
                  item.id === 'workweek' && 'max-sm:hidden',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          {canManage && (
            <Button variant="primary" size="sm" onClick={() => openCreate(null)}>
              <Plus className="size-3.5" /> Nuevo evento
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-200 bg-zinc-50 px-4 py-1.5 sm:px-6">
        {FILTERS.map((filter) => (
          <label key={filter.id} className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={show[filter.id]}
              onChange={(event) => setShow((current) => ({ ...current, [filter.id]: event.target.checked }))}
              style={{ accentColor: filter.color }}
            />
            {filter.label}
          </label>
        ))}
        {canManage && <span className="ml-auto text-xs text-zinc-500 max-sm:hidden">Haz clic en un espacio vacío para crear un evento.</span>}
        {isError && <span className="text-xs text-red-600">{error.message}</span>}
      </div>

      {view === 'month' ? (
        <MonthGrid
          start={start}
          anchor={anchor}
          entries={entries}
          canManage={canManage}
          onOpen={(entry) => setDialog({ type: 'view', entry })}
          onCreate={openCreate}
          onPickDay={(day) => {
            setAnchor(day);
            setView('day');
          }}
        />
      ) : (
        <TimeGrid key={view} days={dayList} entries={entries} canManage={canManage} onOpen={(entry) => setDialog({ type: 'view', entry })} onCreate={openCreate} />
      )}

      {dialog?.type === 'view' && (
        <EntryDetails
          entry={dialog.entry}
          canManage={canManage}
          onClose={() => setDialog(null)}
          onEdit={() => setDialog({ type: 'edit', event: dialog.entry.source })}
        />
      )}
      {(dialog?.type === 'create' || dialog?.type === 'edit') && (
        <EventDialog event={dialog.event} defaults={dialog.defaults} sections={data?.sections ?? []} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
