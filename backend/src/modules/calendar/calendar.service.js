import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { formatLocalDateTime, localClock } from '../../core/utils/dates.js';
import { emitToRoom } from '../../realtime/emitter.js';
import { rooms } from '../../realtime/rooms.js';
import { academicRepository } from '../academic/academic.repository.js';
import { meetingsService } from '../meetings/meetings.service.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { calendarRepository } from './calendar.repository.js';

const MAX_RANGE_DAYS = 62;

const CATEGORY_LABELS = {
  GENERAL: 'Evento',
  FERIADO: 'Feriado',
  EVALUACION: 'Evaluación',
  REUNION: 'Reunión de padres',
  ACTO: 'Acto cívico',
  DEPORTE: 'Deportes',
};

const VERBS = { created: 'Nuevo en el calendario', updated: 'Cambio de fecha', cancelled: 'Evento cancelado' };

const announce = (user, eventId) => emitToRoom(rooms.school(user.schoolId), 'calendar:changed', { eventId, by: user.id });

async function assertSection(sectionId) {
  if (sectionId && !(await calendarRepository.sectionExists(sectionId))) {
    throw AppError.validation([{ field: 'sectionId', issue: 'La sección no existe' }]);
  }
}

async function loadEvent(eventId) {
  const event = await calendarRepository.findEvent(eventId);
  if (!event) throw AppError.notFound('Evento no encontrado');
  return event;
}

function describeWhen(event, timeZone) {
  if (!event.allDay) return formatLocalDateTime(event.startsAt, timeZone);
  const format = (date) => new Intl.DateTimeFormat('es-GT', { timeZone, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(date));
  const start = format(event.startsAt);
  const end = format(event.endsAt);
  return start === end ? start : `${start} al ${end}`;
}

/**
 * Avisa del evento a quien le corresponde (todo el colegio o una sección), menos a quien lo hizo.
 * Debe correr dentro de la transacción; publica después del COMMIT.
 */
async function notifyEvent(connection, afterCommit, { event, user, kind }) {
  const repo = calendarRepository.withConnection(connection);
  const audience = (await repo.findEventAudience(event.section?.id ?? null)).filter((member) => member.userId !== user.id);
  if (!audience.length) return;

  const timeZone = await academicRepository.findSchoolTimezone();
  const when = describeWhen(event, timeZone);
  const where = event.section ? ` · Solo ${event.section.name}` : '';
  const place = event.location ? ` · ${event.location}` : '';
  const stamp = kind === 'created' ? 'created' : `${kind}:${Date.now()}`;
  const base = {
    type: 'EVENT',
    priority: kind === 'cancelled' || event.category === 'FERIADO' ? 'HIGH' : 'NORMAL',
    title: `${VERBS[kind]}: ${event.title}`.slice(0, 200),
    body: `${CATEGORY_LABELS[event.category] ?? 'Evento'} · ${when}${place}${where}`.slice(0, 1000),
    entityType: 'calendar_event',
    entityId: event.id,
    actionUrl: kind === 'cancelled' ? '/calendar' : `/calendar?event=${event.id}&date=${localClock(new Date(event.startsAt), timeZone).date}`,
  };

  // Familias: un aviso por hijo o hija de la sección (así el selector de estudiante funciona)
  const notifications = [];
  const plain = [...new Set(audience.filter((member) => !member.studentId).map((member) => member.userId))];
  notifications.push(...(await notificationsService.createForUsers(connection, plain, { ...base, dedupeKey: `event:${event.id}:${stamp}` })));
  for (const { userId, studentId } of audience.filter((member) => member.studentId)) {
    notifications.push(
      ...(await notificationsService.createForUsers(connection, [userId], { ...base, studentId, dedupeKey: `event:${event.id}:${stamp}:${studentId}` })),
    );
  }
  afterCommit(() => notificationsService.publish(notifications));
}

// Solo un cambio que mueve el evento (o su público) merece aviso; corregir el texto, no
const SCHEDULE_FIELDS = ['startsAt', 'endsAt', 'allDay', 'sectionId'];
const changedSchedule = (current, changes) =>
  SCHEDULE_FIELDS.some((field) => {
    if (changes[field] === undefined) return false;
    if (field === 'sectionId') return (changes.sectionId ?? null) !== (current.section?.id ?? null);
    if (field === 'allDay') return changes.allDay !== current.allDay;
    return new Date(changes[field]).getTime() !== new Date(current[field]).getTime();
  });

export const calendarService = {
  /** Todo lo del rango: eventos del colegio, reuniones de las clases y vencimientos de actividades. */
  async agenda(user, { from, to }) {
    if (to <= from) throw AppError.validation([{ field: 'to', issue: 'Debe ser posterior a from' }]);
    if ((to - from) / 86_400_000 > MAX_RANGE_DAYS) throw AppError.validation([{ field: 'to', issue: `Máximo ${MAX_RANGE_DAYS} días` }]);

    const isAdmin = user.role === 'ADMIN';
    const [events, meetings, activities, sections] = await Promise.all([
      calendarRepository.listEvents(user, { from, to }),
      meetingsService.list(user, { from, to }),
      calendarRepository.listDueActivities(user, { from, to }),
      isAdmin ? calendarRepository.listSections() : [],
    ]);
    return {
      events,
      meetings: meetings.meetings.filter((meeting) => meeting.status === 'SCHEDULED'),
      activities,
      canManage: isAdmin,
      ...(isAdmin && { sections }),
    };
  },

  async create(user, input) {
    await assertSection(input.sectionId);
    const id = await withTransaction(async (connection, afterCommit) => {
      const repo = calendarRepository.withConnection(connection);
      const eventId = await repo.insertEvent({ ...input, createdBy: user.id });
      await notifyEvent(connection, afterCommit, { event: await repo.findEvent(eventId), user, kind: 'created' });
      return eventId;
    });
    announce(user, id);
    return loadEvent(id);
  },

  async update(user, eventId, changes) {
    const current = await loadEvent(eventId);
    const startsAt = changes.startsAt ?? new Date(current.startsAt);
    const endsAt = changes.endsAt ?? new Date(current.endsAt);
    if (endsAt < startsAt) throw AppError.validation([{ field: 'endsAt', issue: 'El fin debe ser posterior al inicio' }]);
    await assertSection(changes.sectionId);

    await withTransaction(async (connection, afterCommit) => {
      const repo = calendarRepository.withConnection(connection);
      await repo.updateEvent(eventId, changes);
      if (changedSchedule(current, changes)) {
        await notifyEvent(connection, afterCommit, { event: await repo.findEvent(eventId), user, kind: 'updated' });
      }
    });
    announce(user, eventId);
    return loadEvent(eventId);
  },

  async remove(user, eventId) {
    const current = await loadEvent(eventId);
    await withTransaction(async (connection, afterCommit) => {
      await calendarRepository.withConnection(connection).softDeleteEvent(eventId);
      // Solo si aún no pasó: avisar que se canceló algo que ya ocurrió no sirve
      if (new Date(current.endsAt) > new Date()) await notifyEvent(connection, afterCommit, { event: current, user, kind: 'cancelled' });
    });
    announce(user, eventId);
  },
};
