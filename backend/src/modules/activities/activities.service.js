import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { matchesSignature } from '../../core/security/fileSignature.js';
import { formatLocalDateTime } from '../../core/utils/dates.js';
import { emitToUsers } from '../../realtime/emitter.js';
import { assertCourseStaff } from '../academic/academic.access.js';
import { academicRepository } from '../academic/academic.repository.js';
import { filesService } from '../files/files.service.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { activitiesRepository } from './activities.repository.js';

const assertStaff = (user, teacherId) => assertCourseStaff(user, teacherId, 'Solo el docente del curso puede gestionar sus actividades');

async function loadActivity(user, activityId) {
  const activity = await activitiesRepository.findForStaff(activityId);
  if (!activity) throw AppError.notFound('Actividad no encontrada');
  assertStaff(user, activity.teacherId);
  return activity;
}

function assertUnitOpen(unit) {
  if (unit.status === 'CLOSED') {
    throw AppError.unprocessable('UNIT_CLOSED', `${unit.name} está cerrada: no se pueden crear ni publicar actividades en ella`);
  }
}

const publicActivity = ({ teacherId, ...activity }) => activity;

/**
 * Publica dentro de la transacción del llamador: crea una entrega PENDING por estudiante
 * inscrito (para la agenda y los recordatorios) y avisa a la sección después del COMMIT.
 */
async function publishInTransaction(connection, afterCommit, activity) {
  const repo = activitiesRepository.withConnection(connection);
  if (!(await repo.setStatus(activity.id, 'DRAFT', 'PUBLISHED'))) {
    throw AppError.unprocessable('INVALID_TRANSITION', 'Solo se publican actividades en borrador');
  }
  const created = await repo.createPendingSubmissions(activity.id, activity.course.id, activity.dueAt);

  const studentIds = await repo.findStudentUserIds(activity.course.id);
  const guardians = await repo.findGuardiansOfCourse(activity.course.id);
  const timezone = await academicRepository.findSchoolTimezone();
  const due = activity.dueAt ? ` · vence el ${formatLocalDateTime(activity.dueAt, timezone)}` : '';
  const base = { type: 'ACTIVITY_PUBLISHED', priority: 'NORMAL', entityType: 'activity', entityId: activity.id };

  const notifications = await notificationsService.createForUsers(connection, studentIds, {
    ...base,
    title: `Nueva actividad: ${activity.title}`.slice(0, 200),
    body: `${activity.course.subject}${due}`,
    actionUrl: `/my/activities/${activity.id}`,
    dedupeKey: `published:${activity.id}`,
  });

  // Familias: un aviso por cada hijo o hija en la sección (con su nombre y enlace a su vista)
  for (const { guardianId, studentId, studentName } of guardians) {
    notifications.push(
      ...(await notificationsService.createForUsers(connection, [guardianId], {
        ...base,
        studentId,
        title: `Nueva actividad para ${studentName}: ${activity.title}`.slice(0, 200),
        body: `${activity.course.subject}${due}`,
        actionUrl: `/my/activities/${activity.id}?student=${studentId}`,
        dedupeKey: `published:${activity.id}:${studentId}`,
      })),
    );
  }

  const guardianIds = [...new Set(guardians.map((guardian) => guardian.guardianId))];
  afterCommit(() => {
    notificationsService.publish(notifications);
    emitToUsers([...studentIds, ...guardianIds], 'activity:published', { activityId: activity.id, courseId: activity.course.id });
  });
  return created;
}

export const activitiesService = {
  async list(user, { courseId, status }) {
    // Docente: solo sus cursos. Administración: todos.
    const teacherId = user.role === 'TEACHER' ? user.id : null;
    return activitiesRepository.listForStaff({ teacherId, courseId, status });
  },

  async create(user, courseId, body, files = []) {
    const course = await academicRepository.findCourse(courseId);
    if (!course) throw AppError.notFound('Curso no encontrado');
    assertStaff(user, course.teacherId);

    const unitId = body.unitId ?? (await activitiesRepository.findActiveUnitForCourse(course.id));
    if (!unitId) throw AppError.unprocessable('NO_ACTIVE_UNIT', 'No hay una unidad activa; elige una unidad');
    const unit = await academicRepository.findUnit(unitId);
    if (!unit || unit.academicYearId !== course.academicYearId) throw AppError.notFound('Unidad no encontrada');
    assertUnitOpen(unit);

    if (body.gradeWeight !== undefined && !body.maxScore) {
      throw AppError.validation([{ field: 'maxScore', issue: 'Indica los puntos para sumarla al cuadro de notas' }]);
    }

    const invalid = files.filter((file) => !matchesSignature(file));
    if (invalid.length) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', `El contenido no coincide con su extensión: ${invalid.map((f) => f.originalname).join(', ')}`);
    }
    // Disco antes de la transacción (no es transaccional); ver nota en homework.service
    const fileIds = [];
    for (const file of files) fileIds.push(await filesService.store(user, file, 'ACTIVITY_RESOURCE'));

    const id = await withTransaction(async (connection, afterCommit) => {
      const repo = activitiesRepository.withConnection(connection);
      const activityId = await repo.insert({
        courseId: course.id,
        unitId: unit.id,
        createdBy: user.id,
        title: body.title,
        description: body.description,
        type: body.type,
        allowLate: body.allowLate,
        maxScore: body.maxScore ?? null,
        dueAt: body.dueAt ?? null,
      });
      await repo.linkResources(activityId, fileIds);
      if (body.gradeWeight !== undefined) {
        await repo.insertLinkedGradeItem({
          activityId,
          courseId: course.id,
          unitId: unit.id,
          name: body.title,
          maxScore: body.maxScore,
          weight: body.gradeWeight,
          createdBy: user.id,
        });
      }

      if (body.publish) {
        const activity = await repo.findForStaff(activityId);
        await publishInTransaction(connection, afterCommit, activity);
      }
      return activityId;
    });

    return publicActivity(await activitiesRepository.findForStaff(id));
  },

  async update(user, activityId, changes) {
    const activity = await loadActivity(user, activityId);

    await withTransaction(async (connection) => {
      const repo = activitiesRepository.withConnection(connection);
      await repo.update(activity.id, changes);
      if (changes.dueAt !== undefined && activity.status === 'PUBLISHED') await repo.rescheduleReminders(activity.id, changes.dueAt);
    });
    return publicActivity(await activitiesRepository.findForStaff(activity.id));
  },

  async publish(user, activityId) {
    const activity = await loadActivity(user, activityId);
    assertUnitOpen(activity.unit);
    const students = await withTransaction((connection, afterCommit) => publishInTransaction(connection, afterCommit, activity));
    return { id: activity.id, status: 'PUBLISHED', students };
  },

  /** Cerrar: deja de recibir entregas y el job apaga sus recordatorios. */
  async close(user, activityId) {
    const activity = await loadActivity(user, activityId);
    if (!(await activitiesRepository.setStatus(activity.id, 'PUBLISHED', 'CLOSED'))) {
      throw AppError.unprocessable('INVALID_TRANSITION', 'Solo se cierran actividades publicadas');
    }
    return { id: activity.id, status: 'CLOSED' };
  },

  /** Reabrir: vuelve a recibir entregas y retoma los recordatorios que el job apagó al cerrarla. */
  async reopen(user, activityId) {
    const activity = await loadActivity(user, activityId);
    assertUnitOpen(activity.unit);
    await withTransaction(async (connection) => {
      const repo = activitiesRepository.withConnection(connection);
      if (!(await repo.setStatus(activity.id, 'CLOSED', 'PUBLISHED'))) {
        throw AppError.unprocessable('INVALID_TRANSITION', 'Solo se reabren actividades cerradas');
      }
      await repo.resumeReminders(activity.id);
    });
    return { id: activity.id, status: 'PUBLISHED' };
  },

  async removeDraft(user, activityId) {
    const activity = await loadActivity(user, activityId);
    if (!(await activitiesRepository.deleteDraft(activity.id))) {
      throw AppError.unprocessable('INVALID_TRANSITION', 'Solo se eliminan borradores; una actividad publicada se cierra');
    }
  },
};
