import { env } from '../config/env.js';
import { withTransaction } from '../core/db/transaction.js';
import { logger } from '../core/utils/logger.js';
import { notificationsService } from '../modules/notifications/notifications.service.js';
import { REMINDER_BATCH_SIZE, remindersRepository } from './reminders.repository.js';
import { buildReminder } from './reminders.messages.js';

const HOUR_MS = 3_600_000;
// El job corre una vez al día a la misma hora. Si el siguiente aviso quedara a +24 h
// exactas, al día siguiente faltarían segundos y se saltaría un día: se resta un margen.
const SCHEDULING_SLACK_MS = 30 * 60_000;
const MAX_BATCHES = 50;

/** Qué recordatorio corresponde (o null si ya no tiene sentido recordar). */
function kindOf(reminder) {
  if (reminder.status === 'REJECTED') return 'correction';
  return reminder.activity.allowLate ? 'overdue' : 'missed';
}

async function notify(connection, reminder, kind, context) {
  const repo = remindersRepository.withConnection(connection);
  const { forStudent, forFamily } = buildReminder(kind, reminder, context);
  const guardians = forFamily ? await repo.findGuardians(reminder.student.id) : [];

  return [
    ...(reminder.student.userId ? await notificationsService.createForUsers(connection, [reminder.student.userId], forStudent) : []),
    ...(guardians.length ? await notificationsService.createForUsers(connection, guardians, forFamily) : []),
  ];
}

async function processReminder(reminder, { school, now }, stats) {
  // Estudiante retirado o actividad que ya no corre: se apaga el ciclo sin avisar
  if (!reminder.student.active || reminder.activity.isOver) {
    await remindersRepository.stopReminders(reminder.submissionId);
    stats.stopped += 1;
    return;
  }

  // Aún no se publica (venció antes de liberarse): esperar a la publicación
  if (reminder.activity.publishAt && new Date(reminder.activity.publishAt) > now) {
    await remindersRepository.reschedule(reminder.submissionId, {
      nextReminderAt: reminder.activity.publishAt,
      reminderCount: reminder.reminderCount,
    });
    stats.postponed += 1;
    return;
  }

  const kind = kindOf(reminder);
  const count = reminder.reminderCount + 1;
  // "missed" se avisa una sola vez: ya no se puede entregar
  const nextReminderAt = kind === 'missed' ? null : new Date(now.getTime() + env.REMINDER_INTERVAL_HOURS * HOUR_MS - SCHEDULING_SLACK_MS);
  const priority = kind !== 'missed' && count >= 3 ? 'URGENT' : 'HIGH';

  await withTransaction(async (connection, afterCommit) => {
    const repo = remindersRepository.withConnection(connection);
    const stillPending = await repo.reschedule(reminder.submissionId, { nextReminderAt, reminderCount: count });
    if (!stillPending) {
      stats.skipped += 1; // entregó mientras corría el job
      return;
    }

    const created = await notify(connection, reminder, kind, { timezone: school.timezone, count, priority });
    stats[kind] += 1;
    stats.notifications += created.length;
    afterCommit(() => notificationsService.publish(created));
  });
}

/**
 * Diario: entregas vencidas sin entregar y correcciones sin reenviar.
 * Se repite cada REMINDER_INTERVAL_HOURS hasta que el estudiante entregue
 * (al entregar, next_reminder_at queda en NULL y el ciclo se detiene).
 */
export const submissionRemindersJob = {
  name: 'submissionReminders',
  at: '07:00',
  description: 'Tareas vencidas y correcciones pendientes: avisa al estudiante y a su familia',

  async run(context) {
    const stats = { overdue: 0, correction: 0, missed: 0, stopped: 0, postponed: 0, skipped: 0, failed: 0, notifications: 0 };
    const seen = new Set();

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
      const due = (await remindersRepository.findDue()).filter((reminder) => !seen.has(reminder.submissionId));
      if (!due.length) break;

      for (const reminder of due) {
        seen.add(reminder.submissionId);
        try {
          await processReminder(reminder, context, stats);
        } catch (err) {
          // Una entrega con problemas no detiene las demás
          stats.failed += 1;
          logger.error({ err, submissionId: reminder.submissionId }, 'Recordatorio fallido');
        }
      }
      if (due.length < REMINDER_BATCH_SIZE) break;
    }
    return stats;
  },
};
