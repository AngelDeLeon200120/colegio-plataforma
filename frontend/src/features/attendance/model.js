// Lógica pura de la hoja de asistencia (sin React). La nota usa la misma regla que el servidor
// (attendance.rules.js): con buena asistencia, todos los puntos; con menos, proporcional.

export const PRESENT = 'PRESENT';
export const ABSENT = 'ABSENT';
export const EXCUSED = 'EXCUSED';

export const cellKey = (date, studentId) => `${date}:${studentId}`;

/** Estado que se ve: la marca sin guardar si la hay; si no, lo guardado. */
export const statusOf = (sheet, changes, date, studentId) => changes[cellKey(date, studentId)] ?? sheet.days[date]?.[studentId] ?? null;

/** Días con alguna marca sin guardar. */
export const changedDates = (changes) => new Set(Object.keys(changes).map((key) => key.split(':')[0]));

/**
 * Lo que cuenta de un día para un estudiante. En un día nuevo con alguna marca, quien no tiene check faltó
 * (así se guardará); en un día ya guardado, sin marca no cuenta (p. ej. se inscribió después).
 */
export function effectiveStatus(sheet, changes, touched, date, studentId) {
  const status = statusOf(sheet, changes, date, studentId);
  if (status) return status;
  return !sheet.days[date] && touched.has(date) ? ABSENT : null;
}

export function summarize(sheet, changes, dates, studentId) {
  const touched = changedDates(changes);
  const summary = { present: 0, absent: 0, excused: 0 };
  for (const date of dates) {
    const status = effectiveStatus(sheet, changes, touched, date, studentId);
    if (status === PRESENT) summary.present += 1;
    else if (status === ABSENT) summary.absent += 1;
    else if (status === EXCUSED) summary.excused += 1;
  }
  const counted = summary.present + summary.absent;
  const rate = counted ? summary.present / counted : null;
  const computed = rate === null ? null : rate >= sheet.goodAttendance ? sheet.maxScore : Math.round(rate * sheet.maxScore * 100) / 100;
  const adjusted = Object.hasOwn(sheet.adjusted, studentId);
  return { ...summary, counted, rate, score: adjusted ? sheet.adjusted[studentId] : computed, adjusted };
}

/** Cambios → días para guardar. Un día nuevo va completo: quien no tiene check, faltó. */
export function toDays(sheet, changes) {
  return [...changedDates(changes)].map((date) => {
    const isNew = !sheet.days[date];
    const entries = sheet.students
      .map(({ id }) => ({ studentId: id, status: changes[cellKey(date, id)] ?? (isNew ? ABSENT : null) }))
      .filter((entry) => entry.status);
    return { date, entries };
  });
}
