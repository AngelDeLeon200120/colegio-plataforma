import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { emitToRoom } from '../../realtime/emitter.js';
import { rooms } from '../../realtime/rooms.js';
import { assertCourseStaff } from '../academic/academic.access.js';
import { academicRepository } from '../academic/academic.repository.js';
import { filesService } from '../files/files.service.js';
import { CELL_ERRORS, cellKey, validateScore } from './gradebook.rules.js';
import { gradebookRepository } from './gradebook.repository.js';
import { buildTemplate } from './import/template.builder.js';
import { parseSheet } from './import/sheet.parser.js';
import { validateImport } from './import/row.validator.js';

const PREVIEW_LIMIT = 200;

async function loadCourse(user, courseId) {
  const course = await academicRepository.findCourse(courseId);
  if (!course) throw AppError.notFound('Curso no encontrado');
  assertCourseStaff(user, course.teacherId, 'Solo el docente asignado al curso puede ver y editar sus notas');
  return course;
}

async function loadUnit(course, unitId) {
  const unit = await academicRepository.findUnit(unitId);
  if (!unit || unit.academicYearId !== course.academicYearId) throw AppError.notFound('Unidad no encontrada');
  return unit;
}

function assertEditable(unit) {
  if (unit.status === 'CLOSED') {
    throw AppError.unprocessable(
      'UNIT_CLOSED',
      `${unit.name} está cerrada: sus notas son de solo lectura. Pide a la administración que la reabra.`,
    );
  }
}

const publicCourse = ({ teacherId, sectionId, academicYearId, ...course }) => course;

/**
 * Valida cada celda contra las columnas de la unidad y los estudiantes inscritos.
 * Devuelve la lista de errores por celda (vacía si todo es válido).
 */
function findCellErrors(cells, items, students) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const enrolled = new Set(students.map((student) => student.id));
  const errors = [];

  for (const cell of cells) {
    const item = itemsById.get(cell.gradeItemId);
    const code = !item
      ? 'UNKNOWN_ITEM'
      : !enrolled.has(cell.studentId)
        ? 'STUDENT_NOT_IN_SECTION'
        : validateScore(cell.score, item.maxScore);
    if (code) errors.push({ gradeItemId: cell.gradeItemId, studentId: cell.studentId, code, message: CELL_ERRORS[code] });
  }
  return errors;
}

/** Si la misma celda viene repetida en el lote, gana la última. */
function dedupeCells(cells) {
  const byKey = new Map(cells.map((cell) => [cellKey(cell.studentId, cell.gradeItemId), cell]));
  return [...byKey.values()];
}

/**
 * Escritura común a la hoja y a la importación: todo o nada.
 * Emite el cambio a los demás editores del curso después del COMMIT.
 */
async function writeCells({ user, course, unit, cells, onStale, beforeWrite }) {
  const [items, students] = await Promise.all([
    gradebookRepository.listItems(course.id, unit.id),
    academicRepository.listSectionStudents(course.sectionId),
  ]);

  const unique = dedupeCells(cells);
  const errors = findCellErrors(unique, items, students);
  if (errors.length) throw onStale ? onStale(errors) : AppError.unprocessable('INVALID_CELLS', `${errors.length} celda(s) con errores`, errors);

  await withTransaction(async (connection, afterCommit) => {
    if (beforeWrite) await beforeWrite(connection);
    await gradebookRepository.withConnection(connection).upsertScores(unique, user.id);
    afterCommit(() =>
      emitToRoom(rooms.courseStaff(course.id), 'gradebook:cells_updated', {
        courseId: course.id,
        unitId: unit.id,
        updatedBy: user.id,
        cells: unique.map(({ gradeItemId, studentId, score }) => ({ gradeItemId, studentId, score })),
      }),
    );
  });
  return unique;
}

function emitItemsChanged(course, unit, user) {
  emitToRoom(rooms.courseStaff(course.id), 'gradebook:items_changed', { courseId: course.id, unitId: unit.id, updatedBy: user.id });
}

async function loadItemForEdit(user, itemId) {
  const item = await gradebookRepository.findItem(itemId);
  if (!item) throw AppError.notFound('Columna no encontrada');
  const course = await loadCourse(user, item.courseId);
  const unit = await loadUnit(course, item.unitId);
  assertEditable(unit);
  return { item, course, unit };
}

export const gradebookService = {
  /** Hoja completa de una unidad. Sin `unitId`, la unidad activa (o la última). */
  async getSheet(user, courseId, unitId) {
    const course = await loadCourse(user, courseId);
    const units = await academicRepository.listUnits(course.academicYearId);
    if (!units.length) throw AppError.unprocessable('NO_UNITS', 'El ciclo no tiene unidades configuradas');

    const unitSummary = unitId
      ? units.find((unit) => unit.id === unitId)
      : (units.find((unit) => unit.status === 'ACTIVE') ?? units.at(-1));
    if (!unitSummary) throw AppError.notFound('Unidad no encontrada');

    const [items, students, scores] = await Promise.all([
      gradebookRepository.listItems(course.id, unitSummary.id),
      academicRepository.listSectionStudents(course.sectionId),
      gradebookRepository.listScores(course.id, unitSummary.id),
    ]);

    return {
      course: publicCourse(course),
      unit: unitSummary,
      units,
      readOnly: unitSummary.status === 'CLOSED',
      items,
      students,
      scores,
    };
  },

  async saveCells(user, courseId, { unitId, cells }) {
    const course = await loadCourse(user, courseId);
    const unit = await loadUnit(course, unitId);
    assertEditable(unit);

    const saved = await writeCells({ user, course, unit, cells });
    return { saved: saved.length, cells: saved.map(({ gradeItemId, studentId, score }) => ({ gradeItemId, studentId, score })) };
  },

  async createItem(user, courseId, { unitId, name, maxScore, weight }) {
    const course = await loadCourse(user, courseId);
    const unit = await loadUnit(course, unitId);
    assertEditable(unit);

    const id = await gradebookRepository.insertItem({ courseId: course.id, unitId: unit.id, name, maxScore, weight, createdBy: user.id });
    emitItemsChanged(course, unit, user);
    return gradebookRepository.findItem(id);
  },

  async updateItem(user, itemId, changes) {
    const { item, course, unit } = await loadItemForEdit(user, itemId);

    if (changes.maxScore !== undefined && changes.maxScore < item.maxScore) {
      const { highest } = await gradebookRepository.scoreStats(item.id);
      if (highest !== null && highest > changes.maxScore) {
        throw AppError.unprocessable(
          'SCORE_OUT_OF_RANGE',
          `Hay notas de hasta ${highest} en esta columna. Corrígelas antes de bajar la nota máxima a ${changes.maxScore}.`,
        );
      }
    }

    await gradebookRepository.updateItem(item.id, changes);
    emitItemsChanged(course, unit, user);
    return gradebookRepository.findItem(item.id);
  },

  async deleteItem(user, itemId, { force }) {
    const { item, course, unit } = await loadItemForEdit(user, itemId);

    const { filled } = await gradebookRepository.scoreStats(item.id);
    if (filled > 0 && !force) {
      throw new AppError(409, 'HAS_SCORES', `La columna tiene ${filled} nota(s). Confirma para eliminarla junto con sus notas.`, {
        filled,
      });
    }

    await gradebookRepository.deleteItem(item.id);
    emitItemsChanged(course, unit, user);
  },

  async buildTemplate(user, courseId, { unitId, format }) {
    const course = await loadCourse(user, courseId);
    const unit = await loadUnit(course, unitId);
    const [items, students, scores] = await Promise.all([
      gradebookRepository.listItems(course.id, unit.id),
      academicRepository.listSectionStudents(course.sectionId),
      gradebookRepository.listScores(course.id, unit.id),
    ]);
    if (!items.length) throw AppError.unprocessable('NO_ITEMS', 'Agrega al menos una columna antes de descargar la plantilla');

    return buildTemplate({ course, unit, items, students, scores }, format);
  },

  /** Fase 1: lee y valida el archivo. No toca las notas. */
  async validateImport(user, courseId, { unitId }, file) {
    if (!file) throw AppError.validation([{ field: 'file', issue: 'Adjunta un archivo .xlsx o .csv' }]);

    const course = await loadCourse(user, courseId);
    const unit = await loadUnit(course, unitId);
    assertEditable(unit);

    const sheet = await parseSheet(file);
    const codes = [...new Set(sheet.rows.map((row) => String(row.cells[0] ?? '').trim()).filter(Boolean))];

    const [items, sectionStudents, schoolStudents, currentScores] = await Promise.all([
      gradebookRepository.listItems(course.id, unit.id),
      academicRepository.listSectionStudents(course.sectionId),
      gradebookRepository.findStudentsByCodes(codes),
      gradebookRepository.listScores(course.id, unit.id),
    ]);

    const result = validateImport(sheet, { items, sectionStudents, schoolStudents, currentScores });
    const status = result.errorRows > 0 ? 'REJECTED' : 'VALIDATED';

    const fileId = await filesService.store(user, file, 'GRADE_IMPORT');
    const importId = await gradebookRepository.insertImport({
      courseId: course.id,
      unitId: unit.id,
      fileId,
      uploadedBy: user.id,
      status,
      totalRows: result.totalRows,
      validRows: result.validRows,
      errorRows: result.errorRows,
      errors: result.errors,
      payload: result.changes.map(({ gradeItemId, studentId, score }) => ({ gradeItemId, studentId, score })),
    });

    return {
      id: importId,
      status,
      fileName: file.originalname,
      totalRows: result.totalRows,
      validRows: result.validRows,
      errorRows: result.errorRows,
      changeCount: result.changes.length,
      unchangedCount: result.unchanged,
      errors: result.errors.slice(0, PREVIEW_LIMIT),
      changes: result.changes.slice(0, PREVIEW_LIMIT),
    };
  },

  /** Fase 2: aplica los cambios validados, revalidando por si algo cambió desde entonces. */
  async applyImport(user, importId) {
    const record = await gradebookRepository.findImport(importId);
    if (!record) throw AppError.notFound('Importación no encontrada');

    const course = await loadCourse(user, record.courseId);
    const unit = await loadUnit(course, record.unitId);
    assertEditable(unit);

    if (record.status !== 'VALIDATED') {
      throw AppError.unprocessable('IMPORT_NOT_APPLICABLE', 'Esta importación tiene errores o ya fue aplicada/descartada');
    }

    const applied = await writeCells({
      user,
      course,
      unit,
      cells: record.payload,
      onStale: (errors) =>
        new AppError(409, 'IMPORT_STALE', 'La hoja cambió desde que se validó el archivo. Vuelve a subirlo.', errors),
      // Bloquea la fila: si dos pestañas aplican a la vez, solo una gana
      beforeWrite: async (connection) => {
        const repo = gradebookRepository.withConnection(connection);
        const locked = await repo.findImport(importId, { forUpdate: true });
        if (locked.status !== 'VALIDATED') throw AppError.conflict('IMPORT_NOT_APPLICABLE', 'La importación ya fue aplicada');
        await repo.setImportStatus(importId, 'APPLIED');
      },
    });
    return { id: importId, status: 'APPLIED', applied: applied.length };
  },

  async discardImport(user, importId) {
    const record = await gradebookRepository.findImport(importId);
    if (!record) throw AppError.notFound('Importación no encontrada');
    await loadCourse(user, record.courseId);

    if (record.status === 'APPLIED') throw AppError.unprocessable('IMPORT_NOT_APPLICABLE', 'La importación ya fue aplicada');
    await gradebookRepository.setImportStatus(importId, 'DISCARDED');
  },
};
