import { BaseRepository } from '../../core/db/BaseRepository.js';

const toItem = (row) => ({
  id: row.id,
  name: row.name,
  maxScore: row.max_score,
  weight: row.weight,
  sortOrder: row.sort_order,
  isPublished: Boolean(row.is_published),
  activityId: row.activity_id,
});

const ITEM_COLUMNS = 'id, name, max_score, weight, sort_order, is_published, activity_id';

// Solo estas columnas se pueden cambiar desde PATCH /grade-items/:id
const UPDATABLE_ITEM_FIELDS = {
  name: 'name',
  maxScore: 'max_score',
  weight: 'weight',
  isPublished: 'is_published',
};

class GradebookRepository extends BaseRepository {
  async listItems(courseId, unitId) {
    const rows = await this.query(
      `SELECT ${ITEM_COLUMNS} FROM grade_items
        WHERE school_id = ? AND course_id = ? AND academic_unit_id = ?
        ORDER BY sort_order, id`,
      [this.schoolId, courseId, unitId],
    );
    return rows.map(toItem);
  }

  async findItem(itemId) {
    const row = await this.one(
      `SELECT ${ITEM_COLUMNS}, course_id, academic_unit_id FROM grade_items WHERE school_id = ? AND id = ?`,
      [this.schoolId, itemId],
    );
    return row && { ...toItem(row), courseId: row.course_id, unitId: row.academic_unit_id };
  }

  async listScores(courseId, unitId) {
    const rows = await this.query(
      `SELECT gs.grade_item_id, gs.student_id, gs.score, gs.is_excused,
              EXISTS (SELECT 1 FROM grade_score_changes ch
                       WHERE ch.school_id = gs.school_id AND ch.grade_item_id = gs.grade_item_id AND ch.student_id = gs.student_id) AS improved
         FROM grade_scores gs
         JOIN grade_items gi ON gi.school_id = gs.school_id AND gi.id = gs.grade_item_id
        WHERE gs.school_id = ? AND gi.course_id = ? AND gi.academic_unit_id = ?`,
      [this.schoolId, courseId, unitId],
    );
    return rows.map((row) => ({
      gradeItemId: row.grade_item_id,
      studentId: row.student_id,
      score: row.score,
      isExcused: Boolean(row.is_excused),
      improved: Boolean(row.improved),
    }));
  }

  /** La columna nueva va al final de la hoja. */
  async insertItem({ courseId, unitId, name, maxScore, weight, createdBy }) {
    const result = await this.query(
      `INSERT INTO grade_items (school_id, course_id, academic_unit_id, name, max_score, weight, sort_order, created_by)
       SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1, ?
         FROM grade_items WHERE school_id = ? AND course_id = ? AND academic_unit_id = ?`,
      [this.schoolId, courseId, unitId, name, maxScore, weight, createdBy, this.schoolId, courseId, unitId],
    );
    return result.insertId;
  }

  async updateItem(itemId, fields) {
    const entries = Object.entries(fields).filter(([key, value]) => UPDATABLE_ITEM_FIELDS[key] && value !== undefined);
    if (!entries.length) return;

    const assignments = entries.map(([key]) => `${UPDATABLE_ITEM_FIELDS[key]} = ?`).join(', ');
    await this.query(`UPDATE grade_items SET ${assignments} WHERE school_id = ? AND id = ?`, [
      ...entries.map(([, value]) => value),
      this.schoolId,
      itemId,
    ]);
  }

  async scoreStats(itemId) {
    const row = await this.one(
      `SELECT COUNT(score) AS filled, MAX(score) AS highest FROM grade_scores WHERE school_id = ? AND grade_item_id = ?`,
      [this.schoolId, itemId],
    );
    return { filled: Number(row.filled), highest: row.highest };
  }

  async deleteItem(itemId) {
    await this.query('DELETE FROM grade_items WHERE school_id = ? AND id = ?', [this.schoolId, itemId]);
  }

  /** Inserta o actualiza celdas en una sola sentencia (UNIQUE grade_item_id + student_id). */
  async upsertScores(cells, updatedBy) {
    if (!cells.length) return;
    const placeholders = cells.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const params = cells.flatMap((cell) => [this.schoolId, cell.gradeItemId, cell.studentId, cell.score, updatedBy]);

    await this.query(
      `INSERT INTO grade_scores (school_id, grade_item_id, student_id, score, updated_by)
       VALUES ${placeholders} AS incoming
       ON DUPLICATE KEY UPDATE score = incoming.score, updated_by = incoming.updated_by`,
      params,
    );
  }

  /** Nota actual de una celda, bloqueada para la transacción de la mejora. */
  async lockScore(gradeItemId, studentId) {
    const row = await this.one(
      'SELECT score FROM grade_scores WHERE school_id = ? AND grade_item_id = ? AND student_id = ? FOR UPDATE',
      [this.schoolId, gradeItemId, studentId],
    );
    return row ? row.score : null;
  }

  async insertChange({ gradeItemId, studentId, oldScore, newScore, note, changedBy }) {
    await this.query(
      `INSERT INTO grade_score_changes (school_id, grade_item_id, student_id, kind, old_score, new_score, note, changed_by)
       VALUES (?, ?, ?, 'MEJORA', ?, ?, ?, ?)`,
      [this.schoolId, gradeItemId, studentId, oldScore, newScore, note ?? null, changedBy],
    );
  }

  async listChanges(gradeItemId, studentId) {
    const rows = await this.query(
      `SELECT ch.id, ch.kind, ch.old_score, ch.new_score, ch.note, ch.created_at, u.first_name, u.last_name
         FROM grade_score_changes ch
         JOIN users u ON u.school_id = ch.school_id AND u.id = ch.changed_by
        WHERE ch.school_id = ? AND ch.grade_item_id = ? AND ch.student_id = ?
        ORDER BY ch.id DESC
        LIMIT 100`,
      [this.schoolId, gradeItemId, studentId],
    );
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      oldScore: row.old_score,
      newScore: row.new_score,
      note: row.note,
      createdAt: row.created_at,
      changedBy: `${row.first_name} ${row.last_name}`,
    }));
  }

  /**
   * Si la columna viene de una actividad y la entrega ya estaba aprobada, su nota se
   * actualiza también (en la escala de la actividad) para que estudiante y familia vean lo mismo.
   * No cambia el estado de la entrega ni genera avisos.
   */
  async syncApprovedSubmission({ activityId, studentId, score, itemMaxScore }) {
    await this.query(
      `UPDATE submissions s
         JOIN activities a ON a.school_id = s.school_id AND a.id = s.activity_id
          SET s.score = IF(a.max_score IS NULL OR a.max_score = ?, ?, ROUND(? / ? * a.max_score, 2))
        WHERE s.school_id = ? AND s.activity_id = ? AND s.student_id = ? AND s.status = 'APPROVED'`,
      [itemMaxScore, score, score, itemMaxScore, this.schoolId, activityId, studentId],
    );
  }

  async findStudentsByCodes(codes) {
    if (!codes.length) return [];
    const rows = await this.query(
      `SELECT id, student_code FROM students WHERE school_id = ? AND student_code IN (${codes.map(() => '?').join(', ')})`,
      [this.schoolId, ...codes],
    );
    return rows.map((row) => ({ id: row.id, code: row.student_code }));
  }

  async insertImport(data) {
    const result = await this.query(
      `INSERT INTO grade_imports
         (school_id, course_id, academic_unit_id, file_id, uploaded_by, status, total_rows, valid_rows, error_rows, errors, parsed_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        this.schoolId,
        data.courseId,
        data.unitId,
        data.fileId,
        data.uploadedBy,
        data.status,
        data.totalRows,
        data.validRows,
        data.errorRows,
        JSON.stringify(data.errors),
        JSON.stringify(data.payload),
      ],
    );
    return result.insertId;
  }

  async findImport(importId, { forUpdate = false } = {}) {
    const row = await this.one(
      `SELECT id, course_id, academic_unit_id, status, parsed_payload FROM grade_imports
        WHERE school_id = ? AND id = ? ${forUpdate ? 'FOR UPDATE' : ''}`,
      [this.schoolId, importId],
    );
    return row && { id: row.id, courseId: row.course_id, unitId: row.academic_unit_id, status: row.status, payload: row.parsed_payload ?? [] };
  }

  async setImportStatus(importId, status) {
    await this.query(
      `UPDATE grade_imports SET status = ?, applied_at = IF(? = 'APPLIED', UTC_TIMESTAMP(), applied_at)
        WHERE school_id = ? AND id = ?`,
      [status, status, this.schoolId, importId],
    );
  }
}

export const gradebookRepository = new GradebookRepository();
