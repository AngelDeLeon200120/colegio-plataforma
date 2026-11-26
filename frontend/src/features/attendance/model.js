// Lógica pura de la hoja de asistencia (sin React). La calificación usa la misma regla que el servidor
// (attendance.rules.js): con buena asistencia, todos los puntos; con menos, proporcional.

export const PRESENT = 'PRESENT';
export const ABSENT = 'ABSENT';
export const EXCUSED = 'EXCUSED';
export const MAX_NOTE = 200;

const DAY_MS = 86_400_000;
const toDate = (text) => new Date(`${text}T00:00:00Z`);
const toText = (date) => date.toISOString().slice(0, 10);

/**
 * Columnas de la hoja: los días de clase de esta semana (de lunes a viernes, o los del colegio) y los que ya
 * tienen lista. Los de esta semana que aún no llegan se ven, pero no se pueden marcar.
 */
export function sheetDates(sheet) {
  const today = toDate(sheet.today);
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS);
  const week = Array.from({ length: 7 }, (_, index) => new Date(monday.getTime() + index * DAY_MS))
    .filter((date) => sheet.classDays.includes(date.getUTCDay()))
    .map(toText)
    .filter((date) => date >= sheet.unit.startsOn);
  return [...new Set([...Object.keys(sheet.days), ...week])].sort();
}

/** Último día de clase hasta hoy (si hoy no hay clase, el anterior que sí). */
export function lastClassDay(sheet, dates) {
  return [...dates].reverse().find((date) => date <= sheet.today) ?? dates[0] ?? sheet.today;
}

export const cellKey = (date, studentId) => `${date}:${studentId}`;

const savedStatus = (sheet, date, studentId) => sheet.days[date]?.[studentId] ?? null;
const savedNote = (sheet, date, studentId) => sheet.notes[date]?.[studentId] ?? '';

/** Lo que se ve: el cambio sin guardar si lo hay; si no, lo guardado. */
export const statusOf = (sheet, changes, date, studentId) => changes[cellKey(date, studentId)]?.status ?? savedStatus(sheet, date, studentId);
export const noteOf = (sheet, changes, date, studentId) => changes[cellKey(date, studentId)]?.note ?? savedNote(sheet, date, studentId);

/** Días con alguna marca o nota sin guardar. */
export const changedDates = (changes) => new Set(Object.keys(changes).map((key) => key.split(':')[0]));

/** Aplica un cambio { status?, note? }; volver a lo guardado (o quitar el check de un día nuevo) no es un cambio. */
export function withChange(sheet, changes, date, studentId, patch) {
  const key = cellKey(date, studentId);
  const next = { ...changes[key], ...patch };
  const baseStatus = savedStatus(sheet, date, studentId) ?? (sheet.days[date] ? null : ABSENT);
  if (next.status === baseStatus) delete next.status;
  if (next.note === savedNote(sheet, date, studentId)) delete next.note;

  const result = { ...changes, [key]: next };
  if (!Object.keys(next).length) delete result[key];
  return result;
}

/**
 * Lo que cuenta de un día para un estudiante. En un día nuevo con algún cambio, quien no tiene check faltó
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

/** Cambios → días para guardar. Un día nuevo va completo (sin check = faltó); de uno guardado, solo lo que cambió. */
export function toDays(sheet, changes) {
  return [...changedDates(changes)].map((date) => {
    const isNew = !sheet.days[date];
    const entries = sheet.students
      .filter(({ id }) => isNew || cellKey(date, id) in changes)
      .map(({ id }) => ({
        studentId: id,
        status: statusOf(sheet, changes, date, id) ?? ABSENT,
        note: noteOf(sheet, changes, date, id).trim() || null,
      }));
    return { date, entries };
  });
}
