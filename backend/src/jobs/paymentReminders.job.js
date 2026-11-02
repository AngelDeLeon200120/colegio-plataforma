import { withTransaction } from '../core/db/transaction.js';
import { localClock } from '../core/utils/dates.js';
import { financeRepository } from '../modules/finance/finance.repository.js';
import { formatMoney } from '../modules/finance/money.js';
import { notificationsService } from '../modules/notifications/notifications.service.js';

const DUE_SOON_DAYS = 5;
const OVERDUE_REPEAT_DAYS = 7;
const URGENT_AFTER_DAYS = 30;

const addDays = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// Las fechas de vencimiento son DATE locales: se formatean sin convertir de zona
const formatDueDate = (isoDate) =>
  new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${isoDate}T00:00:00Z`));

function buildNotification(charge, currency) {
  const money = formatMoney(charge.balance, currency);
  const base = { entityType: 'charge', entityId: charge.id, studentId: charge.studentId, actionUrl: `/finance?student=${charge.studentId}` };

  if (charge.daysOverdue <= 0) {
    return {
      ...base,
      type: 'PAYMENT_DUE_SOON',
      priority: 'NORMAL',
      title: `Pago próximo: ${charge.description}`,
      body: `Vence el ${formatDueDate(charge.dueDate)} · saldo ${money} · ${charge.studentName}`,
      dedupeKey: `pay-due:${charge.id}:${charge.dueDate}`,
    };
  }

  // Un aviso por semana de atraso: días 1, 8, 15… (la clave cambia cada 7 días)
  const week = Math.floor((charge.daysOverdue - 1) / OVERDUE_REPEAT_DAYS);
  return {
    ...base,
    type: 'PAYMENT_OVERDUE',
    priority: charge.daysOverdue > URGENT_AFTER_DAYS ? 'URGENT' : 'HIGH',
    title: `Pago vencido: ${charge.description}`,
    body: `${charge.studentName} tiene un saldo vencido de ${money} desde el ${formatDueDate(charge.dueDate)} (${charge.daysOverdue} días).`,
    dedupeKey: `pay-overdue:${charge.id}:${week}`,
  };
}

/**
 * Diario: marca vencidos los cargos sin pagar y avisa a los encargados financieros
 * de lo que vence en los próximos días y de lo atrasado (semanalmente).
 */
export const paymentRemindersJob = {
  name: 'paymentReminders',
  at: '08:00',
  description: 'Marca cargos vencidos y avisa a las familias de pagos próximos y atrasados',

  async run({ school, now }) {
    const today = localClock(now, school.timezone).date;
    const { currency } = await financeRepository.findSchoolInfo();

    const markedOverdue = await financeRepository.markOverdue(today);
    const charges = await financeRepository.chargesToRemind(today, addDays(today, DUE_SOON_DAYS));

    const stats = { markedOverdue, dueSoon: 0, overdue: 0, withoutGuardian: 0, notifications: 0 };
    await withTransaction(async (connection, afterCommit) => {
      const repo = financeRepository.withConnection(connection);
      const created = [];

      for (const charge of charges) {
        const guardians = await repo.financeGuardians(charge.studentId);
        if (!guardians.length) {
          stats.withoutGuardian += 1;
          continue;
        }
        const notification = buildNotification(charge, currency);
        const sent = await notificationsService.createForUsers(connection, guardians, notification);
        if (sent.length) stats[notification.type === 'PAYMENT_DUE_SOON' ? 'dueSoon' : 'overdue'] += 1;
        created.push(...sent);
      }

      stats.notifications = created.length;
      afterCommit(() => notificationsService.publish(created));
    });
    return stats;
  },
};
