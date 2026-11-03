import { BaseRepository } from '../../core/db/BaseRepository.js';

// Orden de la cola de revisión: lo que requiere acción del profesor primero
const REVIEW_QUEUE_ORDER = "FIELD(s.status, 'SUBMITTED', 'REJECTED', 'PENDING', 'APPROVED')";

const toStudent = (row) => ({
  id: row.student_id,
  code: row.student_code,
  firstName: row.first_name,
  lastName: row.last_name,
});

class SubmissionsRepository extends BaseRepository {
  async findActivity(activityId) {
    const row = await this.one(
      `SELECT a.id, a.title, a.due_at, a.max_score, a.status, a.course_id, c.teacher_id,
              sub.name AS subject_name, gl.short_name AS grade_name, sec.name AS section_name
         FROM activities a
         JOIN courses c       ON c.school_id = a.school_id AND c.id = a.course_id
         JOIN subjects sub    ON sub.school_id = c.school_id AND sub.id = c.subject_id
         JOIN sections sec    ON sec.school_id = c.school_id AND sec.id = c.section_id
         JOIN grade_levels gl ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
        WHERE a.school_id = ? AND a.id = ? AND a.deleted_at IS NULL`,
      [this.schoolId, activityId],
    );
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      dueAt: row.due_at,
      maxScore: row.max_score,
      status: row.status,
      courseId: row.course_id,
      courseName: `${row.grade_name} ${row.section_name} · ${row.subject_name}`,
      teacherId: row.teacher_id,
    };
  }

  async listByActivity(activityId, status) {
    const params = [this.schoolId, activityId];
    if (status) params.push(status);

    const rows = await this.query(
      `SELECT s.id, s.status, s.attempt_count, s.last_submitted_at, s.is_late, s.score, s.version, s.reviewed_at,
              st.id AS student_id, st.student_code, st.first_name, st.last_name
         FROM submissions s
         JOIN students st ON st.school_id = s.school_id AND st.id = s.student_id
        WHERE s.school_id = ? AND s.activity_id = ? ${status ? 'AND s.status = ?' : ''}
        ORDER BY ${REVIEW_QUEUE_ORDER}, st.last_name, st.first_name`,
      params,
    );

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      attemptCount: row.attempt_count,
      lastSubmittedAt: row.last_submitted_at,
      isLate: Boolean(row.is_late),
      score: row.score,
      version: row.version,
      reviewedAt: row.reviewed_at,
      student: toStudent(row),
    }));
  }

  async countByStatus(activityId) {
    const rows = await this.query(
      `SELECT status, COUNT(*) AS total FROM submissions
        WHERE school_id = ? AND activity_id = ?
        GROUP BY status`,
      [this.schoolId, activityId],
    );

    const summary = { PENDING: 0, SUBMITTED: 0, REJECTED: 0, APPROVED: 0, total: 0 };
    for (const row of rows) {
      summary[row.status] = Number(row.total);
      summary.total += Number(row.total);
    }
    return summary;
  }

  /** Con `forUpdate` bloquea solo la fila de submissions hasta el COMMIT. */
  async findById(submissionId, { forUpdate = false } = {}) {
    const row = await this.one(
      `SELECT s.id, s.status, s.score, s.version, s.last_feedback, s.is_late, s.attempt_count,
              s.last_submitted_at, s.reviewed_at, s.student_id,
              a.id AS activity_id, a.title AS activity_title, a.due_at, a.max_score, a.course_id,
              c.teacher_id,
              st.student_code, st.first_name, st.last_name, st.user_id AS student_user_id,
              (SELECT sa.id FROM submission_attempts sa
                WHERE sa.school_id = s.school_id AND sa.submission_id = s.id
                ORDER BY sa.attempt_number DESC LIMIT 1) AS last_attempt_id
         FROM submissions s
         JOIN activities a ON a.school_id = s.school_id AND a.id = s.activity_id
         JOIN courses c    ON c.school_id = a.school_id AND c.id = a.course_id
         JOIN students st  ON st.school_id = s.school_id AND st.id = s.student_id
        WHERE s.school_id = ? AND s.id = ? AND a.deleted_at IS NULL
        ${forUpdate ? 'FOR UPDATE OF s' : ''}`,
      [this.schoolId, submissionId],
    );
    if (!row) return null;

    return {
      id: row.id,
      status: row.status,
      score: row.score,
      version: row.version,
      lastFeedback: row.last_feedback,
      isLate: Boolean(row.is_late),
      attemptCount: row.attempt_count,
      lastSubmittedAt: row.last_submitted_at,
      reviewedAt: row.reviewed_at,
      activity: { id: row.activity_id, title: row.activity_title, dueAt: row.due_at, maxScore: row.max_score, courseId: row.course_id },
      student: toStudent(row),
      // Internos: el servicio los usa para autorizar y notificar, no se exponen
      teacherId: row.teacher_id,
      studentUserId: row.student_user_id,
      lastAttemptId: row.last_attempt_id,
    };
  }

  async findAttempts(submissionId) {
    const rows = await this.query(
      `SELECT sa.id, sa.attempt_number, sa.student_comment, sa.is_late, sa.submitted_at,
              f.id AS file_id, f.original_name, f.mime_type, f.size_bytes
         FROM submission_attempts sa
         LEFT JOIN submission_attempt_files saf ON saf.school_id = sa.school_id AND saf.attempt_id = sa.id
         LEFT JOIN files f ON f.school_id = saf.school_id AND f.id = saf.file_id AND f.deleted_at IS NULL
        WHERE sa.school_id = ? AND sa.submission_id = ?
        ORDER BY sa.attempt_number, f.id`,
      [this.schoolId, submissionId],
    );

    const attempts = new Map();
    for (const row of rows) {
      if (!attempts.has(row.id)) {
        attempts.set(row.id, {
          id: row.id,
          number: row.attempt_number,
          comment: row.student_comment,
          isLate: Boolean(row.is_late),
          submittedAt: row.submitted_at,
          files: [],
        });
      }
      if (row.file_id) {
        attempts.get(row.id).files.push({ id: row.file_id, name: row.original_name, mimeType: row.mime_type, size: row.size_bytes });
      }
    }
    return [...attempts.values()];
  }

  async findReviews(submissionId) {
    const rows = await this.query(
      `SELECT r.id, r.attempt_id, r.decision, r.feedback, r.score, r.created_at, u.first_name, u.last_name
         FROM submission_reviews r
         JOIN users u ON u.school_id = r.school_id AND u.id = r.reviewer_id
        WHERE r.school_id = ? AND r.submission_id = ?
        ORDER BY r.created_at, r.id`,
      [this.schoolId, submissionId],
    );

    return rows.map((row) => ({
      id: row.id,
      attemptId: row.attempt_id,
      decision: row.decision,
      feedback: row.feedback,
      score: row.score,
      createdAt: row.created_at,
      reviewer: { name: `${row.first_name} ${row.last_name}` },
    }));
  }

  async findGuardianUserIds(studentId) {
    const rows = await this.query(
      `SELECT guardian_id FROM guardian_students
        WHERE school_id = ? AND student_id = ? AND receives_notifications = 1`,
      [this.schoolId, studentId],
    );
    return rows.map((row) => row.guardian_id);
  }

  /**
   * Actualización con bloqueo optimista: solo aplica si `version` no cambió.
   * Reinicia el ciclo de recordatorios (next_reminder_at / reminder_count).
   */
  async applyReview({ submissionId, status, score, feedback, reviewerId, nextReminderAt, expectedVersion }) {
    const result = await this.query(
      `UPDATE submissions
          SET status = ?, score = ?, last_feedback = ?, reviewed_by = ?, reviewed_at = UTC_TIMESTAMP(),
              next_reminder_at = ?, reminder_count = 0, version = version + 1
        WHERE school_id = ? AND id = ? AND version = ?`,
      [status, score, feedback, reviewerId, nextReminderAt, this.schoolId, submissionId, expectedVersion],
    );
    return result.affectedRows === 1;
  }

  /** Columna del cuadro de notas ligada a la actividad (si la hay) y si su unidad sigue abierta. */
  async findLinkedGradeItem(activityId) {
    const row = await this.one(
      `SELECT gi.id, gi.max_score, gi.course_id, gi.academic_unit_id, u.status AS unit_status
         FROM grade_items gi
         JOIN academic_units u ON u.school_id = gi.school_id AND u.id = gi.academic_unit_id
        WHERE gi.school_id = ? AND gi.activity_id = ?`,
      [this.schoolId, activityId],
    );
    return row && { id: row.id, maxScore: row.max_score, courseId: row.course_id, unitId: row.academic_unit_id, unitClosed: row.unit_status === 'CLOSED' };
  }

  async upsertGradeScore(gradeItemId, studentId, score, updatedBy) {
    await this.query(
      `INSERT INTO grade_scores (school_id, grade_item_id, student_id, score, updated_by) VALUES (?, ?, ?, ?, ?) AS incoming
       ON DUPLICATE KEY UPDATE score = incoming.score, updated_by = incoming.updated_by`,
      [this.schoolId, gradeItemId, studentId, score, updatedBy],
    );
  }

  async insertReview({ submissionId, attemptId, reviewerId, decision, feedback, score }) {
    await this.query(
      `INSERT INTO submission_reviews (school_id, submission_id, attempt_id, reviewer_id, decision, feedback, score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [this.schoolId, submissionId, attemptId, reviewerId, decision, feedback, score],
    );
  }
}

export const submissionsRepository = new SubmissionsRepository();
