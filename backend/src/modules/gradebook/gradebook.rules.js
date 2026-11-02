// Reglas de una celda de nota. Las comparten el guardado desde la hoja y la
// importación de archivos, para que ambos caminos acepten exactamente lo mismo.

export const MAX_CELLS_PER_SAVE = 2000;

export const CELL_ERRORS = {
  NOT_A_NUMBER: 'No es un número',
  SCORE_OUT_OF_RANGE: 'Fuera de rango',
  TOO_MANY_DECIMALS: 'Máximo 2 decimales',
  UNKNOWN_ITEM: 'La columna no pertenece a este curso y unidad',
  STUDENT_NOT_IN_SECTION: 'El estudiante no está inscrito en la sección',
};

const hasMoreThanTwoDecimals = (value) => Math.abs(value * 100 - Math.round(value * 100)) > 1e-9;

/**
 * Convierte lo que escribió el usuario (o una celda de Excel) en número.
 * Acepta coma decimal ("18,5"). Vacío = null (sin nota).
 */
export function parseScore(raw) {
  if (raw === null || raw === undefined) return { value: null };
  if (typeof raw === 'number') return Number.isFinite(raw) ? { value: raw } : { error: 'NOT_A_NUMBER' };

  const text = String(raw).trim();
  if (text === '') return { value: null };
  if (!/^-?\d+([.,]\d+)?$/.test(text)) return { error: 'NOT_A_NUMBER' };
  return { value: Number(text.replace(',', '.')) };
}

/** Código de error o null si la nota es válida para esa columna. */
export function validateScore(value, maxScore) {
  if (value === null) return null;
  if (!Number.isFinite(value)) return 'NOT_A_NUMBER';
  if (value < 0 || value > maxScore) return 'SCORE_OUT_OF_RANGE';
  if (hasMoreThanTwoDecimals(value)) return 'TOO_MANY_DECIMALS';
  return null;
}

export const cellKey = (studentId, gradeItemId) => `${studentId}:${gradeItemId}`;
