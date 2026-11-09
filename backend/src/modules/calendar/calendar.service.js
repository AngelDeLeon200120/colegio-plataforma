import { AppError } from '../../core/errors/AppError.js';
import { emitToRoom } from '../../realtime/emitter.js';
import { rooms } from '../../realtime/rooms.js';
import { meetingsService } from '../meetings/meetings.service.js';
import { calendarRepository } from './calendar.repository.js';

const MAX_RANGE_DAYS = 62;

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
    const id = await calendarRepository.insertEvent({ ...input, createdBy: user.id });
    announce(user, id);
    return loadEvent(id);
  },

  async update(user, eventId, changes) {
    const current = await loadEvent(eventId);
    const startsAt = changes.startsAt ?? new Date(current.startsAt);
    const endsAt = changes.endsAt ?? new Date(current.endsAt);
    if (endsAt < startsAt) throw AppError.validation([{ field: 'endsAt', issue: 'El fin debe ser posterior al inicio' }]);
    await assertSection(changes.sectionId);

    await calendarRepository.updateEvent(eventId, changes);
    announce(user, eventId);
    return loadEvent(eventId);
  },

  async remove(user, eventId) {
    await loadEvent(eventId);
    await calendarRepository.softDeleteEvent(eventId);
    announce(user, eventId);
  },
};
