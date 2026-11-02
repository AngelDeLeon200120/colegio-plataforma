// Agrupación y textos de la agenda del estudiante (sin React).

export const ACTIVITY_TYPES = {
  TASK: 'Tarea',
  PROJECT: 'Proyecto',
  EXAM: 'Evaluación',
  READING: 'Lectura',
  PRACTICE: 'Práctica',
};

export const ACCEPTED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'docx', 'xlsx', 'pptx', 'zip', 'doc', 'xls', 'ppt'];
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const isOverdue = (activity, now = Date.now()) => Boolean(activity.dueAt) && new Date(activity.dueAt).getTime() < now;

/** Grupo de la agenda al que pertenece cada actividad, en orden de urgencia. */
export function groupOf(activity) {
  const { status } = activity.submission;
  if (status === 'REJECTED') return 'attention';
  if (status === 'PENDING') return activity.isClosed ? 'missed' : isOverdue(activity) ? (activity.allowLate ? 'attention' : 'missed') : 'todo';
  if (status === 'SUBMITTED') return 'review';
  return 'done';
}

export const GROUPS = [
  { id: 'attention', title: 'Requieren atención', hint: 'Correcciones pedidas y tareas vencidas que aún se pueden entregar' },
  { id: 'todo', title: 'Por entregar' },
  { id: 'review', title: 'En revisión' },
  { id: 'done', title: 'Calificadas' },
  { id: 'missed', title: 'Sin entregar (plazo cerrado)' },
];

const DAY_MS = 86_400_000;

/** "Vence hoy", "Vence en 3 días", "Venció hace 2 días"… */
export function dueLabel(dueAt, now = Date.now()) {
  if (!dueAt) return { text: 'Sin fecha límite', tone: 'muted' };
  const due = new Date(dueAt);
  const days = Math.round((startOfDay(due) - startOfDay(new Date(now))) / DAY_MS);

  if (due.getTime() < now) {
    const ago = -days;
    return { text: ago <= 0 ? 'Venció hoy' : ago === 1 ? 'Venció ayer' : `Venció hace ${ago} días`, tone: 'danger' };
  }
  if (days === 0) return { text: 'Vence hoy', tone: 'warning' };
  if (days === 1) return { text: 'Vence mañana', tone: 'warning' };
  return { text: `Vence en ${days} días`, tone: days <= 3 ? 'warning' : 'muted' };
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}
