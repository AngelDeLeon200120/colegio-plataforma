// Calendario: categorías, colores y aritmética de fechas (en la hora local del navegador).

export const CATEGORY_LOOK = {
  GENERAL: { label: 'General', color: '#1a73e8' },
  FERIADO: { label: 'Feriado / asueto', color: '#16a34a' },
  EVALUACION: { label: 'Evaluaciones', color: '#dc2626' },
  REUNION: { label: 'Reunión de padres', color: '#ea580c' },
  ACTO: { label: 'Acto cívico', color: '#db2777' },
  DEPORTE: { label: 'Deportes', color: '#0891b2' },
};

export const MEETING_COLOR = '#7c3aed';
export const ACTIVITY_COLOR = '#475569';

export const VIEWS = [
  { id: 'month', label: 'Mes', days: 42 },
  { id: 'week', label: 'Semana', days: 7 },
  { id: 'day', label: 'Día', days: 1 },
];

// Día completo (las entregas suelen vencer a las 23:59); la vista abre desplazada a las 7:00
export const DAY_START_HOUR = 0;
export const DAY_END_HOUR = 24;
export const HOUR_HEIGHT = 48;

export const startOfDay = (date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

export const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

/** La semana empieza en lunes, como en el calendario escolar. */
export const startOfWeek = (date) => {
  const day = startOfDay(date);
  return addDays(day, -((day.getDay() + 6) % 7));
};

export const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Primer día visible y cantidad de días de la vista alrededor de `anchor`. */
export function visibleRange(view, anchor) {
  if (view === 'day') return { start: startOfDay(anchor), days: 1 };
  if (view === 'month') {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return { start: startOfWeek(first), days: 42 };
  }
  return { start: startOfWeek(anchor), days: 7 };
}

export function shiftAnchor(view, anchor, direction) {
  if (view === 'month') return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
  if (view === 'day') return addDays(anchor, direction);
  return addDays(anchor, 7 * direction);
}

const monthTitle = new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric' });
const dayTitle = new Intl.DateTimeFormat('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const weekdayShort = new Intl.DateTimeFormat('es-GT', { weekday: 'short' });
export const timeFormat = new Intl.DateTimeFormat('es-GT', { hour: 'numeric', minute: '2-digit' });
export const longDateTime = new Intl.DateTimeFormat('es-GT', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
export const longDate = new Intl.DateTimeFormat('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export function rangeTitle(view, anchor) {
  if (view === 'day') return capitalize(dayTitle.format(anchor));
  if (view === 'month') return capitalize(monthTitle.format(anchor));
  const { start, days } = visibleRange(view, anchor);
  const end = addDays(start, days - 1);
  return start.getMonth() === end.getMonth()
    ? capitalize(monthTitle.format(start))
    : `${capitalize(new Intl.DateTimeFormat('es-GT', { month: 'short' }).format(start))} – ${monthTitle.format(end)}`;
}

/**
 * Une eventos, reuniones y vencimientos en una sola lista de "entradas" del calendario.
 * Cada entrada: { key, kind, title, start, end, allDay, color, source }.
 */
export function toEntries(agenda, show) {
  if (!agenda) return [];
  const entries = [];
  if (show.events) {
    for (const event of agenda.events) {
      entries.push({
        key: `event-${event.id}`,
        kind: 'event',
        title: event.title,
        start: new Date(event.startsAt),
        end: new Date(event.endsAt),
        allDay: event.allDay,
        color: CATEGORY_LOOK[event.category]?.color ?? CATEGORY_LOOK.GENERAL.color,
        source: event,
      });
    }
  }
  if (show.meetings) {
    for (const meeting of agenda.meetings) {
      entries.push({
        key: `meeting-${meeting.id}`,
        kind: 'meeting',
        title: meeting.title,
        start: new Date(meeting.startsAt),
        end: new Date(meeting.endsAt),
        allDay: false,
        color: MEETING_COLOR,
        source: meeting,
      });
    }
  }
  if (show.activities) {
    for (const activity of agenda.activities) {
      const due = new Date(activity.dueAt);
      entries.push({
        key: `activity-${activity.id}`,
        kind: 'activity',
        title: `Entrega: ${activity.title}`,
        start: new Date(due.getTime() - 30 * 60_000),
        end: due,
        allDay: false,
        color: activity.course.color ?? ACTIVITY_COLOR,
        source: activity,
      });
    }
  }
  return entries.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** ¿La entrada ocupa (al menos en parte) ese día? */
export const touchesDay = (entry, day) => entry.start < addDays(startOfDay(day), 1) && entry.end > startOfDay(day);

/** Reparte en carriles las entradas con hora que se solapan dentro de un día (como Teams). */
export function layoutDay(entries) {
  const lanes = [];
  const placed = entries.map((entry) => {
    let lane = lanes.findIndex((laneEnd) => laneEnd <= entry.start);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(entry.end);
    } else {
      lanes[lane] = entry.end;
    }
    return { entry, lane };
  });
  return placed.map((item) => ({ ...item, lanes: lanes.length }));
}

/** Valor de <input type="datetime-local"> / <input type="date"> en la hora local. */
export function toLocalInput(date, withTime = true) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  return withTime ? local.slice(0, 16) : local.slice(0, 10);
}
