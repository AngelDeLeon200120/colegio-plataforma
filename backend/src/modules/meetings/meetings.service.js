import { randomInt } from 'node:crypto';
import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { formatLocalDateTime } from '../../core/utils/dates.js';
import { emitToUsers } from '../../realtime/emitter.js';
import { assertCourseStaff } from '../academic/academic.access.js';
import { academicRepository } from '../academic/academic.repository.js';
import { activitiesRepository } from '../activities/activities.repository.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { meetingsRepository } from './meetings.repository.js';

// Sin letras ni números que se confundan al dictarlos (0/O, 1/I/L)
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomChunk = (length) => Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

const slugPart = (text, length) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, length);

/** "MAT-3B-K7Q2X9": materia y sección para reconocerlo + parte aleatoria para que nadie lo adivine. */
async function generateCode(repo, course) {
  const [sectionName] = course.name.split(' · ');
  const prefix = `${slugPart(course.subject, 3) || 'CLS'}-${slugPart(sectionName, 4) || 'SEC'}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `${prefix}-${randomChunk(6)}`;
    if (!(await repo.codeExists(code))) return code;
  }
  throw new AppError(503, 'CODE_UNAVAILABLE', 'No se pudo generar un código único. Intenta de nuevo.');
}

const STAFF = ['TEACHER', 'ADMIN'];
const canManage = (user, meeting) => user.role === 'ADMIN' || (user.role === 'TEACHER' && meeting.teacherId === user.id);

function present(user, meeting, slug) {
  const { teacherId, ...rest } = meeting;
  const endsAt = new Date(new Date(meeting.startsAt).getTime() + meeting.durationMinutes * 60_000);
  return {
    ...rest,
    endsAt: endsAt.toISOString(),
    joinUrl: meeting.provider === 'EXTERNAL' ? meeting.externalUrl : `https://meet.jit.si/${slug}-${meeting.code}`,
    canManage: canManage(user, meeting),
  };
}

async function loadCourseForStaff(user, courseId) {
  const course = await academicRepository.findCourse(courseId);
  if (!course) throw AppError.notFound('Curso no encontrado');
  assertCourseStaff(user, course.teacherId, 'Solo el docente del curso o la administración pueden programar sus reuniones');
  return course;
}

async function loadManaged(user, meetingId) {
  const meeting = await meetingsRepository.findVisible(user, meetingId);
  if (!meeting) throw AppError.notFound('Reunión no encontrada');
  if (!canManage(user, meeting)) throw AppError.forbidden('Solo el docente del curso o la administración pueden cambiar esta reunión');
  return meeting;
}

/** Avisa a estudiantes y familias de la sección (y refresca las listas abiertas). */
async function notifyCourse(connection, afterCommit, { meeting, user, kind }) {
  const repo = activitiesRepository.withConnection(connection);
  const studentIds = await repo.findStudentUserIds(meeting.course.id);
  const guardians = await repo.findGuardiansOfCourse(meeting.course.id);
  const timezone = await academicRepository.findSchoolTimezone();
  const when = formatLocalDateTime(meeting.startsAt, timezone);
  const verb = { created: 'Nueva reunión', updated: 'Reunión actualizada', cancelled: 'Reunión cancelada' }[kind];

  const base = {
    type: 'MEETING',
    priority: kind === 'cancelled' ? 'HIGH' : 'NORMAL',
    title: `${verb}: ${meeting.title}`.slice(0, 200),
    body: `${meeting.course.subject} · ${when} · Código ${meeting.code}`.slice(0, 1000),
    entityType: 'meeting',
    entityId: meeting.id,
    actionUrl: `/meetings?focus=${meeting.id}`,
  };
  const stamp = Date.now();
  const notifications = await notificationsService.createForUsers(
    connection,
    studentIds.filter((id) => id !== user.id),
    { ...base, dedupeKey: `meeting:${meeting.id}:${kind}:${stamp}` },
  );
  for (const { guardianId, studentId } of guardians) {
    notifications.push(
      ...(await notificationsService.createForUsers(connection, [guardianId], {
        ...base,
        studentId,
        dedupeKey: `meeting:${meeting.id}:${kind}:${studentId}:${stamp}`,
      })),
    );
  }
  const audience = [...new Set([user.id, meeting.teacherId, ...studentIds, ...guardians.map((guardian) => guardian.guardianId)])];
  afterCommit(() => {
    notificationsService.publish(notifications);
    emitToUsers(audience, 'meeting:changed', { meetingId: meeting.id, kind });
  });
}

export const meetingsService = {
  async list(user, filters) {
    const [meetings, slug] = await Promise.all([meetingsRepository.listVisible(user, filters), meetingsRepository.findSchoolSlug()]);
    return { meetings: meetings.map((meeting) => present(user, meeting, slug)), canSchedule: STAFF.includes(user.role) };
  },

  async findByCode(user, code) {
    const meeting = await meetingsRepository.findVisibleByCode(user, code.trim().toUpperCase());
    if (!meeting) throw AppError.notFound('No hay ninguna reunión de tus clases con ese código');
    return present(user, meeting, await meetingsRepository.findSchoolSlug());
  },

  async create(user, courseId, input) {
    const course = await loadCourseForStaff(user, courseId);
    const id = await withTransaction(async (connection, afterCommit) => {
      const repo = meetingsRepository.withConnection(connection);
      const code = await generateCode(repo, course);
      const meetingId = await repo.insert({ ...input, courseId: course.id, code, createdBy: user.id });
      const meeting = await repo.findVisible(user, meetingId);
      await notifyCourse(connection, afterCommit, { meeting, user, kind: 'created' });
      return meetingId;
    });
    return present(user, await meetingsRepository.findVisible(user, id), await meetingsRepository.findSchoolSlug());
  },

  async update(user, meetingId, changes) {
    const current = await loadManaged(user, meetingId);
    if (current.status === 'CANCELLED') throw AppError.unprocessable('MEETING_CANCELLED', 'La reunión está cancelada');
    const provider = changes.provider ?? current.provider;
    const externalUrl = provider === 'EXTERNAL' ? (changes.externalUrl ?? current.externalUrl) : null;
    if (provider === 'EXTERNAL' && !externalUrl) {
      throw AppError.validation([{ field: 'externalUrl', issue: 'Pega el enlace de la reunión' }]);
    }

    await withTransaction(async (connection, afterCommit) => {
      const repo = meetingsRepository.withConnection(connection);
      await repo.update(meetingId, { ...changes, provider, externalUrl });
      const meeting = await repo.findVisible(user, meetingId);
      await notifyCourse(connection, afterCommit, { meeting, user, kind: 'updated' });
    });
    return present(user, await meetingsRepository.findVisible(user, meetingId), await meetingsRepository.findSchoolSlug());
  },

  async cancel(user, meetingId) {
    const current = await loadManaged(user, meetingId);
    if (current.status === 'CANCELLED') return present(user, current, await meetingsRepository.findSchoolSlug());
    await withTransaction(async (connection, afterCommit) => {
      const repo = meetingsRepository.withConnection(connection);
      await repo.setStatus(meetingId, 'CANCELLED');
      await notifyCourse(connection, afterCommit, { meeting: { ...current, status: 'CANCELLED' }, user, kind: 'cancelled' });
    });
    return present(user, await meetingsRepository.findVisible(user, meetingId), await meetingsRepository.findSchoolSlug());
  },
};
