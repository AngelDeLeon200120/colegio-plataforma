import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { matchesSignature } from '../../core/security/fileSignature.js';
import { emitToRoom, emitToUsers } from '../../realtime/emitter.js';
import { rooms } from '../../realtime/rooms.js';
import { filesService } from '../files/files.service.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { assertTransition } from '../submissions/submission.stateMachine.js';
import { submissionsRepository } from '../submissions/submissions.repository.js';
import { homeworkRepository } from './homework.repository.js';

/**
 * Estudiante: siempre su propio expediente.
 * Familia: el hijo o hija indicado (o el primero), solo si existe el vínculo.
 */
export async function resolveStudent(user, studentId) {
  if (user.role === 'STUDENT') {
    const student = await homeworkRepository.findStudentByUser(user.id);
    if (!student) throw AppError.forbidden('Tu usuario no está vinculado a un expediente de estudiante');
    return { student, canSubmit: true };
  }

  if (user.role === 'PARENT') {
    if (!studentId) throw AppError.validation([{ field: 'studentId', issue: 'Indica el estudiante' }]);
    const student = await homeworkRepository.findGuardedStudent(user.id, studentId);
    if (!student) throw AppError.notFound('Estudiante no encontrado');
    return { student, canSubmit: false };
  }

  throw AppError.forbidden();
}

/** Por qué no se puede entregar ahora (o null si sí se puede). */
function submitBlocker(activity, now = new Date()) {
  if (!activity.requiresSubmission) return { code: 'NO_SUBMISSION_REQUIRED', message: 'Esta actividad no requiere entrega en la plataforma' };
  if (activity.isClosed) return { code: 'ACTIVITY_CLOSED', message: 'La actividad está cerrada y ya no recibe entregas' };
  if (!['PENDING', 'REJECTED'].includes(activity.submission.status)) {
    return { code: 'ALREADY_SUBMITTED', message: 'Ya entregaste esta actividad' };
  }
  const late = activity.dueAt && now > new Date(activity.dueAt);
  if (late && !activity.allowLate) return { code: 'LATE_NOT_ALLOWED', message: 'Venció el plazo y esta actividad no acepta entregas tardías' };
  return null;
}

export const homeworkService = {
  async listActivities(user, { studentId }) {
    const { student } = await resolveStudent(user, studentId);
    return { student, activities: await homeworkRepository.listActivities(student.id) };
  },

  async getActivity(user, activityId, { studentId }) {
    const { student, canSubmit } = await resolveStudent(user, studentId);
    const activity = await homeworkRepository.findActivity(student.id, activityId);
    if (!activity) throw AppError.notFound('Actividad no encontrada');

    const submissionId = activity.submission.id;
    const [resources, attempts, reviews] = await Promise.all([
      homeworkRepository.listActivityResources(activity.id),
      submissionId ? submissionsRepository.findAttempts(submissionId) : [],
      submissionId ? submissionsRepository.findReviews(submissionId) : [],
    ]);

    const blocker = submitBlocker(activity);
    const { teacher, courseId, ...publicActivity } = activity;
    return {
      student,
      activity: { ...publicActivity, teacherName: teacher.name, resources },
      attempts,
      reviews,
      canSubmit: canSubmit && !blocker,
      submitBlocker: canSubmit ? blocker : { code: 'READ_ONLY', message: 'Solo el estudiante puede entregar' },
    };
  },

  async submit(user, activityId, { comment }, files = []) {
    if (user.role !== 'STUDENT') throw AppError.forbidden('Solo el estudiante puede entregar sus actividades');
    if (!files.length) throw AppError.validation([{ field: 'files', issue: 'Adjunta al menos un archivo' }]);

    const invalid = files.filter((file) => !matchesSignature(file));
    if (invalid.length) {
      throw new AppError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        `El contenido no coincide con su extensión: ${invalid.map((file) => file.originalname).join(', ')}`,
      );
    }

    const { student } = await resolveStudent(user, null);
    const activity = await homeworkRepository.findActivity(student.id, activityId);
    if (!activity) throw AppError.notFound('Actividad no encontrada');

    const blocker = submitBlocker(activity);
    if (blocker) throw AppError.unprocessable(blocker.code, blocker.message);

    // Los archivos se escriben antes de la transacción (el disco no es transaccional).
    // Si la transacción falla quedan huérfanos; una tarea de limpieza puede borrarlos.
    const fileIds = [];
    for (const file of files) fileIds.push(await filesService.store(user, file, 'SUBMISSION'));

    const isLate = Boolean(activity.dueAt && new Date() > new Date(activity.dueAt));

    const result = await withTransaction(async (connection, afterCommit) => {
      const repo = homeworkRepository.withConnection(connection);
      await repo.ensureSubmission(activity.id, student.id, activity.dueAt);
      const submission = await repo.lockSubmission(activity.id, student.id);

      // Revalida con la fila bloqueada: dos pestañas entregando a la vez → solo una pasa
      assertTransition('submit', submission.status);

      const attemptNumber = submission.attemptCount + 1;
      const attemptId = await repo.insertAttempt({ submissionId: submission.id, attemptNumber, comment, submittedBy: user.id, isLate });
      await repo.linkAttemptFiles(attemptId, fileIds);
      await repo.markSubmitted(submission.id, { attemptNumber, isLate });

      const studentName = `${student.firstName} ${student.lastName}`;
      const notifications = await notificationsService.createForUsers(connection, [activity.teacher.id], {
        type: 'SUBMISSION_RECEIVED',
        priority: 'NORMAL',
        title: `Nueva entrega: ${activity.title}`.slice(0, 200),
        body: `${studentName} entregó${attemptNumber > 1 ? ` la corrección (intento ${attemptNumber})` : ''}${isLate ? ' fuera de plazo' : ''}.`,
        entityType: 'submission',
        entityId: submission.id,
        studentId: student.id,
        actionUrl: `/activities/${activity.id}/review`,
        data: { activityId: activity.id, submissionId: submission.id },
      });
      const guardianIds = await repo.findGuardianUserIds(student.id);

      afterCommit(() => {
        notificationsService.publish(notifications);
        const event = { submissionId: submission.id, activityId: activity.id, studentId: student.id, status: 'SUBMITTED', version: submission.version + 1 };
        emitToRoom(rooms.courseStaff(activity.courseId), 'submission:updated', event);
        emitToUsers([user.id, ...guardianIds], 'submission:updated', event);
      });

      return { submissionId: submission.id, attemptId, attemptNumber, status: 'SUBMITTED', isLate };
    });

    return result;
  },
};
