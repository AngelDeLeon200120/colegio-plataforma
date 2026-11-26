// Nota de asistencia: con buena asistencia se ganan todos los puntos; con menos, la parte proporcional.

export const GOOD_ATTENDANCE = 0.8;

// Días de clase (0 = domingo … 6 = sábado). Por defecto, de lunes a viernes. Un colegio con clases en fin de
// semana lo indica en schools.settings: { "classDays": [1, 2, 3, 4, 5, 6] }.
export const DEFAULT_CLASS_DAYS = [1, 2, 3, 4, 5];

export function classDaysFrom(settings) {
  const days = settings?.classDays;
  const valid = Array.isArray(days) ? [...new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort() : [];
  return valid.length ? valid : DEFAULT_CLASS_DAYS;
}

/** Día de la semana de una fecha "YYYY-MM-DD" (sin depender de la zona horaria). */
export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

export const EMPTY_SUMMARY = { present: 0, absent: 0, excused: 0 };

/** Parte de los días que vino, sin contar las faltas justificadas. null si no hay días que cuenten. */
export function attendanceRate({ present, absent }) {
  const counted = present + absent;
  return counted ? present / counted : null;
}

export function attendanceScore(summary, maxScore) {
  const rate = attendanceRate(summary);
  if (rate === null) return null;
  return rate >= GOOD_ATTENDANCE ? maxScore : Math.round(rate * maxScore * 100) / 100;
}
