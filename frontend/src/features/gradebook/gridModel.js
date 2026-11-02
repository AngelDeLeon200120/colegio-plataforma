// Lógica pura de la hoja de notas (sin React): misma validación que el backend
// (gradebook.rules.js), formato para portapapeles y cálculo de totales.

// Nota mínima de aprobación sobre 100. Pendiente: leerla de schools.settings.
export const PASSING_SCORE = 60;

export const ERROR_LABELS = {
  NOT_A_NUMBER: 'No es un número',
  SCORE_OUT_OF_RANGE: 'Fuera de rango',
  TOO_MANY_DECIMALS: 'Máximo 2 decimales',
  UNKNOWN_ITEM: 'La columna ya no existe',
  STUDENT_NOT_IN_SECTION: 'El estudiante ya no está en la sección',
};

export const cellKey = (studentId, itemId) => `${studentId}:${itemId}`;

/** "18,5" → { value: 18.5 } · "" → { value: null } · "abc" → { error } */
export function parseInput(raw, maxScore) {
  const text = String(raw ?? '').trim();
  if (text === '') return { value: null };
  if (!/^\d+([.,]\d+)?$/.test(text)) return { error: 'NOT_A_NUMBER' };

  const value = Number(text.replace(',', '.'));
  if (value < 0 || value > maxScore) return { error: 'SCORE_OUT_OF_RANGE' };
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-9) return { error: 'TOO_MANY_DECIMALS' };
  return { value };
}

/** Texto que se muestra/copia de una celda. */
export function cellText(cell) {
  if (!cell) return '';
  if (cell.error) return cell.raw;
  return cell.value === null || cell.value === undefined ? '' : String(cell.value);
}

export function toTsv(matrix) {
  return matrix.map((row) => row.join('\t')).join('\n');
}

/** Lo que Excel / Google Sheets ponen en el portapapeles: filas por \n, columnas por \t. */
export function parseTsv(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.map((line) => line.split('\t'));
}

/**
 * Zona acumulada sobre 100: Σ (nota / máx × peso). Las notas faltantes cuentan 0,
 * como en el cuadro de notas en papel. `null` si ninguna columna tiene peso.
 */
export function accumulatedTotal(items, valueOf) {
  const weightSum = items.reduce((sum, item) => sum + item.weight, 0);
  if (weightSum === 0) return null;
  return items.reduce((sum, item) => {
    const value = valueOf(item);
    return value === null || value === undefined ? sum : sum + (value / item.maxScore) * item.weight;
  }, 0);
}

export function average(values) {
  const present = values.filter((value) => value !== null && value !== undefined);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null;
}

export const round = (value, decimals = 1) => (value === null ? null : Math.round(value * 10 ** decimals) / 10 ** decimals);
