import { FIXED_COLUMNS } from './gradebook.exams.js';

/**
 * Columnas de la hoja. La primera vez que se usa una unidad con columnas fijas, se crean
 * Asistencia, Parcial y Evaluación. `repo`: gradebookRepository, con o sin transacción.
 */
export async function ensureSheetItems(repo, { courseId, unit, createdBy }) {
  const items = await repo.listItems(courseId, unit.id);
  if (!unit.examColumns || unit.status === 'CLOSED') return items;
  const missing = FIXED_COLUMNS.filter((column) => !items.some((item) => item.kind === column.kind));
  if (!missing.length) return items;

  await repo.ensureFixedItems({ courseId, unitId: unit.id, columns: missing, createdBy });
  return repo.listItems(courseId, unit.id);
}
