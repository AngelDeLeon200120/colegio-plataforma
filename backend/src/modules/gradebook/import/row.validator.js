import { AppError } from '../../../core/errors/AppError.js';
import { CELL_ERRORS, cellKey, parseScore, validateScore } from '../gradebook.rules.js';
import { FIXED_HEADERS } from './template.builder.js';

const ITEM_ID_PATTERN = /\[#(\d+)\]\s*$/;

const MESSAGES = {
  ...CELL_ERRORS,
  UNKNOWN_STUDENT_CODE: 'El código no existe en el colegio',
  DUPLICATE_STUDENT: 'El estudiante aparece más de una vez en el archivo',
  MISSING_CODE: 'Fila sin código de estudiante',
};

/**
 * Relaciona cada columna del archivo con una columna de la hoja.
 * Si el archivo es de otro curso o unidad, ningún [#id] coincide y se rechaza entero.
 */
function mapColumns(header, items) {
  if (header[0]?.toLowerCase() !== FIXED_HEADERS[0].toLowerCase()) {
    throw AppError.unprocessable('TEMPLATE_MISMATCH', 'La primera columna debe ser "Código". Descarga la plantilla de nuevo.');
  }

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const columns = [];
  const unknown = [];

  header.forEach((title, index) => {
    if (index < FIXED_HEADERS.length || title === '') return;
    const match = ITEM_ID_PATTERN.exec(title);
    const item = match && itemsById.get(Number(match[1]));
    if (item) columns.push({ index, item });
    else unknown.push(title);
  });

  if (!columns.length) {
    throw AppError.unprocessable(
      'TEMPLATE_MISMATCH',
      'Ninguna columna corresponde a este curso y unidad. Descarga la plantilla desde esta hoja.',
    );
  }
  return { columns, unknown };
}

/**
 * Valida todas las filas y calcula los cambios contra las notas actuales.
 * Celda vacía = sin cambio (no borra la nota existente).
 */
export function validateImport({ header, rows }, { items, sectionStudents, schoolStudents, currentScores }) {
  const { columns, unknown } = mapColumns(header, items);

  const enrolled = new Map(sectionStudents.map((student) => [student.id, student]));
  const idByCode = new Map(schoolStudents.map((student) => [student.code.toLowerCase(), student.id]));
  const current = new Map(currentScores.map((score) => [cellKey(score.studentId, score.gradeItemId), score.score]));

  const errors = unknown.map((title) => ({
    row: 1,
    column: title,
    code: 'UNKNOWN_COLUMN',
    message: 'Columna desconocida: se ignora',
    warning: true,
  }));
  const changes = [];
  const seen = new Set();
  const rowsWithErrors = new Set();
  let unchanged = 0;

  const fail = (row, column, code) => {
    errors.push({ row: row.rowNumber, column, code, message: MESSAGES[code] });
    rowsWithErrors.add(row.rowNumber);
  };

  for (const row of rows) {
    const code = String(row.cells[0] ?? '').trim();
    if (!code) {
      if (columns.some(({ index }) => String(row.cells[index] ?? '').trim() !== '')) fail(row, FIXED_HEADERS[0], 'MISSING_CODE');
      continue;
    }

    const studentId = idByCode.get(code.toLowerCase());
    if (!studentId) {
      fail(row, FIXED_HEADERS[0], 'UNKNOWN_STUDENT_CODE');
      continue;
    }
    if (!enrolled.has(studentId)) {
      fail(row, FIXED_HEADERS[0], 'STUDENT_NOT_IN_SECTION');
      continue;
    }
    if (seen.has(studentId)) {
      fail(row, FIXED_HEADERS[0], 'DUPLICATE_STUDENT');
      continue;
    }
    seen.add(studentId);

    // Una fila con algún error no aporta cambios: la vista previa muestra solo lo aplicable
    const rowChanges = [];
    let rowUnchanged = 0;
    for (const { index, item } of columns) {
      const parsed = parseScore(row.cells[index]);
      if (parsed.error) {
        fail(row, item.name, parsed.error);
        continue;
      }
      if (parsed.value === null) continue;

      const problem = validateScore(parsed.value, item.maxScore);
      if (problem) {
        fail(row, item.name, problem);
        continue;
      }

      const before = current.get(cellKey(studentId, item.id)) ?? null;
      if (before === parsed.value) {
        rowUnchanged += 1;
        continue;
      }
      const student = enrolled.get(studentId);
      rowChanges.push({
        gradeItemId: item.id,
        studentId,
        score: parsed.value,
        before,
        studentName: `${student.lastName}, ${student.firstName}`,
        itemName: item.name,
      });
    }

    if (!rowsWithErrors.has(row.rowNumber)) {
      changes.push(...rowChanges);
      unchanged += rowUnchanged;
    }
  }

  return {
    totalRows: rows.length,
    errorRows: rowsWithErrors.size,
    validRows: rows.length - rowsWithErrors.size,
    errors,
    changes,
    unchanged,
  };
}
