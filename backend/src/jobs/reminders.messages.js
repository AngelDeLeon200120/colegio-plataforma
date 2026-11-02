import { formatLocalDateTime } from '../core/utils/dates.js';

const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Textos de cada recordatorio, para el estudiante y para su familia.
 * kind: 'overdue' | 'correction' | 'missed' | 'dueSoon'
 */
export function buildReminder(kind, reminder, { timezone, count, priority }) {
  const { activity, student } = reminder;
  const due = activity.dueAt ? formatLocalDateTime(activity.dueAt, timezone) : null;
  const feedback = reminder.lastFeedback ? `“${truncate(reminder.lastFeedback, 300)}”` : '';
  const urgent = count >= 3 ? ` (${count}.º aviso)` : '';

  const texts = {
    overdue: {
      type: 'ACTIVITY_OVERDUE',
      // Las horas terminan en "p. m.": se evita poner otro punto justo después
      student: [`Tarea vencida: ${activity.title}`, `Venció el ${due} y todavía puedes entregarla; quedará como tardía.${urgent}`],
      family: [`${student.firstName} no ha entregado: ${activity.title}`, `Venció el ${due} y aún puede entregarla como tardía.${urgent}`],
    },
    correction: {
      type: 'CORRECTION_PENDING',
      student: [`Corrección pendiente: ${activity.title}`, `${feedback} Reenvía tu trabajo corregido.${urgent}`.trim()],
      family: [`${student.firstName} tiene una corrección pendiente: ${activity.title}`, `${feedback} Aún no reenvía el trabajo corregido.${urgent}`.trim()],
    },
    missed: {
      type: 'ACTIVITY_MISSED',
      student: [`No entregaste: ${activity.title}`, `El plazo cerró el ${due} y no acepta entregas tardías. Habla con tu docente.`],
      family: [`${student.firstName} no entregó: ${activity.title}`, `El plazo cerró el ${due} y la actividad no acepta entregas tardías.`],
    },
    dueSoon: {
      type: 'ACTIVITY_DUE_SOON',
      student: [`Vence pronto: ${activity.title}`, `Vence el ${due}, ¡no la dejes para el final!`],
      family: null,
    },
  }[kind];

  const base = {
    type: texts.type,
    priority,
    entityType: 'submission',
    entityId: reminder.submissionId,
    studentId: student.id,
    dedupeKey: `${kind}:${reminder.submissionId}:${count}`,
    data: { activityId: activity.id, submissionId: reminder.submissionId },
  };

  const forStudent = {
    ...base,
    title: truncate(texts.student[0], 200),
    body: truncate(texts.student[1], 1000),
    actionUrl: `/my/activities/${activity.id}`,
  };
  const forFamily = texts.family && {
    ...base,
    title: truncate(texts.family[0], 200),
    body: truncate(texts.family[1], 1000),
    actionUrl: `/my/activities/${activity.id}?student=${student.id}`,
  };
  return { forStudent, forFamily };
}
