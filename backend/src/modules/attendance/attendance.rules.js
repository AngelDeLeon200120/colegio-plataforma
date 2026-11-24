// Nota de asistencia: con buena asistencia se ganan todos los puntos; con menos, la parte proporcional.

export const GOOD_ATTENDANCE = 0.8;

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
