import { ensureSheetItems } from '../gradebook/gradebook.fixed.js';
import { gradebookRepository } from '../gradebook/gradebook.repository.js';
import { attendanceRepository } from './attendance.repository.js';
import { EMPTY_SUMMARY, attendanceScore } from './attendance.rules.js';

/**
 * Lleva la asistencia a la columna Asistencia del cuadro, dentro de la transacción del llamador.
 * Una celda cambiada con "Mejora" se respeta. `clearedIds`: estudiantes a quienes se les quitó un día
 * (si ya no tienen ninguno, su nota queda vacía). Devuelve si hubo cambios.
 */
export async function syncAttendanceScores(connection, { course, unit, students, userId, clearedIds = [] }) {
  if (!unit.examColumns || unit.status === 'CLOSED') return false;
  const grades = gradebookRepository.withConnection(connection);
  const items = await ensureSheetItems(grades, { courseId: course.id, unit, createdBy: userId });
  const item = items.find((candidate) => candidate.kind === 'ATTENDANCE');

  const summaries = await attendanceRepository.withConnection(connection).summaries(course.id, unit.id);
  const scores = await grades.listScores(course.id, unit.id);
  const current = new Map(scores.filter((score) => score.gradeItemId === item.id).map((score) => [score.studentId, score]));
  const cleared = new Set(clearedIds);

  const cells = [];
  for (const { id } of students) {
    const score = attendanceScore(summaries.get(id) ?? EMPTY_SUMMARY, item.maxScore);
    const cell = current.get(id);
    if (cell?.improved || score === (cell?.score ?? null)) continue;
    // Sin días que cuenten no hay nota automática: no se toca lo que haya puesto el docente
    if (score === null && !summaries.has(id) && !cleared.has(id)) continue;
    cells.push({ gradeItemId: item.id, studentId: id, score });
  }
  await grades.upsertScores(cells, userId);
  return cells.length > 0;
}
