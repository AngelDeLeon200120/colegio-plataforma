import { withTransaction } from '../core/db/transaction.js';
import { notificationsService } from '../modules/notifications/notifications.service.js';
import { remindersRepository } from './reminders.repository.js';
import { buildReminder } from './reminders.messages.js';

/** Diario por la tarde: "vence pronto" para lo que vence en las próximas 24 h. */
export const dueSoonRemindersJob = {
  name: 'dueSoonReminders',
  at: '16:00',
  description: 'Avisa al estudiante de las tareas que vencen en las próximas 24 horas',

  async run({ school }) {
    const pending = await remindersRepository.findDueSoon();
    let notifications = 0;

    await withTransaction(async (connection, afterCommit) => {
      const created = [];
      for (const reminder of pending) {
        const { forStudent } = buildReminder('dueSoon', reminder, { timezone: school.timezone, count: 1, priority: 'NORMAL' });
        // La fecha en la clave: si el docente mueve el plazo, se vuelve a avisar
        forStudent.dedupeKey = `dueSoon:${reminder.submissionId}:${new Date(reminder.activity.dueAt).toISOString()}`;
        created.push(...(await notificationsService.createForUsers(connection, [reminder.student.userId], forStudent)));
      }
      notifications = created.length;
      afterCommit(() => notificationsService.publish(created));
    });

    return { candidates: pending.length, notifications };
  },
};
