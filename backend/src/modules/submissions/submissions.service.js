import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { emitToRoom, emitToUsers } from '../../realtime/emitter.js';
import { rooms } from '../../realtime/rooms.js';
import { assertCourseStaff as assertStaff } from '../academic/academic.access.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { submissionsRepository } from './submissions.repository.js';
import { assertTransition } from './submission.stateMachine.js';

const HOUR_MS = 3_600_000;

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const assertCourseStaff = (user, teacherId) =>
  assertStaff(user, teacherId, 'Solo el docente asignado al curso puede revisar estas entregas');

async function getActivityForStaff(user, activityId) {
  const activity = await submissionsRepository.findActivity(activityId);
  if (!activity) throw AppError.notFound('Actividad no encontrada');
  assertCourseStaff(user, activity.teacherId);
  return activity;
}

function toPublicSubmission({ teacherId, studentUserId, lastAttemptId, ...submission }) {
  return submission;
}

/**
 * Si la actividad tiene una columna en el cuadro de notas, la nota aprobada se copia ahí
 * (proporcional si los puntos máximos difieren). Unidad cerrada: el cuadro es de solo lectura.
 */
async function syncGradebook(repo, submission, score, userId) {
  const item = await repo.findLinkedGradeItem(submission.activity.id);
  if (!item || item.unitClosed) return null;

  const activityMax = submission.activity.maxScore;
  const scaled = activityMax && activityMax !== item.maxScore ? Math.round((score / activityMax) * item.maxScore * 100) / 100 : score;
  if (scaled > item.maxScore) return null;

  await repo.upsertGradeScore(item.id, submission.student.id, scaled, userId);
  return { gradeItemId: item.id, unitId: item.unitId, score: scaled };
}

function buildReviewNotification(action, submission, feedback, score) {
  const { activity, student } = submission;
  const base = {
    entityType: 'submission',
    entityId: submission.id,
    studentId: student.id,
    actionUrl: `/my/activities/${activity.id}`,
    data: { activityId: activity.id, submissionId: submission.id },
  };

  if (action === 'reject') {
    return {
      ...base,
      type: 'SUBMISSION_REJECTED',
      priority: 'HIGH',
      title: truncate(`Corrección requerida: ${activity.title}`, 200),
      body: truncate(`${student.firstName} ${student.lastName} · ${feedback}`, 1000),
    };
  }

  const scoreText = score !== null && activity.maxScore !== null ? ` con ${score}/${activity.maxScore}` : '';
  return {
    ...base,
    type: 'SUBMISSION_APPROVED',
    priority: 'NORMAL',
    title: truncate(`Entrega aprobada: ${activity.title}`, 200),
    body: `${student.firstName} ${student.lastName} aprobó la actividad${scoreText}.`,
  };
}

async function review(user, submissionId, action, { score = null, feedback = null, version }) {
  return withTransaction(async (connection, afterCommit) => {
    const repo = submissionsRepository.withConnection(connection);

    const submission = await repo.findById(submissionId, { forUpdate: true });
    if (!submission) throw AppError.notFound('Entrega no encontrada');
    assertCourseStaff(user, submission.teacherId);

    if (submission.version !== version) {
      throw AppError.conflict('VERSION_CONFLICT', 'Esta entrega cambió mientras la revisabas. Recarga para ver su estado actual.');
    }

    const nextStatus = assertTransition(action, submission.status);

    const { maxScore } = submission.activity;
    if (score !== null && maxScore !== null && score > maxScore) {
      throw AppError.unprocessable('SCORE_OUT_OF_RANGE', `La nota máxima es ${maxScore}`, [
        { field: 'score', issue: `max ${maxScore}` },
      ]);
    }

    // Rechazada: el cron volverá a recordar al alumno y a sus encargados hasta que reenvíe
    const nextReminderAt = action === 'reject' ? new Date(Date.now() + env.REMINDER_INTERVAL_HOURS * HOUR_MS) : null;

    const updated = await repo.applyReview({
      submissionId,
      status: nextStatus,
      score,
      feedback,
      reviewerId: user.id,
      nextReminderAt,
      expectedVersion: version,
    });
    if (!updated) throw AppError.conflict('VERSION_CONFLICT', 'Esta entrega cambió mientras la revisabas.');

    await repo.insertReview({
      submissionId,
      attemptId: submission.lastAttemptId,
      reviewerId: user.id,
      decision: nextStatus,
      feedback,
      score,
    });

    const gradeCell = action === 'approve' && score !== null ? await syncGradebook(repo, submission, score, user.id) : null;

    const guardianIds = await repo.findGuardianUserIds(submission.student.id);
    const audience = [submission.studentUserId, ...guardianIds].filter(Boolean);
    const notification = buildReviewNotification(action, submission, feedback, score);
    // Mismo texto; el enlace de la familia indica de qué hijo o hija se trata
    const notifications = [
      ...(submission.studentUserId
        ? await notificationsService.createForUsers(connection, [submission.studentUserId], notification)
        : []),
      ...(await notificationsService.createForUsers(connection, guardianIds, {
        ...notification,
        actionUrl: `${notification.actionUrl}?student=${submission.student.id}`,
      })),
    ];

    const result = {
      id: submission.id,
      status: nextStatus,
      score,
      lastFeedback: feedback,
      version: version + 1,
      reviewedAt: new Date().toISOString(),
    };

    afterCommit(() => {
      notificationsService.publish(notifications);
      const event = {
        submissionId: submission.id,
        activityId: submission.activity.id,
        studentId: submission.student.id,
        status: nextStatus,
        version: result.version,
      };
      emitToUsers(audience, 'submission:updated', event);
      emitToRoom(rooms.courseStaff(submission.activity.courseId), 'submission:updated', event);
      if (gradeCell) {
        emitToRoom(rooms.courseStaff(submission.activity.courseId), 'gradebook:cells_updated', {
          courseId: submission.activity.courseId,
          unitId: gradeCell.unitId,
          updatedBy: user.id,
          cells: [{ gradeItemId: gradeCell.gradeItemId, studentId: submission.student.id, score: gradeCell.score }],
        });
      }
    });

    return result;
  });
}

export const submissionsService = {
  async listForActivity(user, activityId, { status }) {
    const { teacherId, ...activity } = await getActivityForStaff(user, activityId);
    const [summary, items] = await Promise.all([
      submissionsRepository.countByStatus(activityId),
      submissionsRepository.listByActivity(activityId, status),
    ]);
    return { activity, summary, items };
  },

  async getDetail(user, submissionId) {
    const submission = await submissionsRepository.findById(submissionId);
    if (!submission) throw AppError.notFound('Entrega no encontrada');
    assertCourseStaff(user, submission.teacherId);

    const [attempts, reviews] = await Promise.all([
      submissionsRepository.findAttempts(submissionId),
      submissionsRepository.findReviews(submissionId),
    ]);
    return { ...toPublicSubmission(submission), attempts, reviews };
  },

  approve: (user, submissionId, input) => review(user, submissionId, 'approve', input),
  reject: (user, submissionId, input) => review(user, submissionId, 'reject', input),
};
