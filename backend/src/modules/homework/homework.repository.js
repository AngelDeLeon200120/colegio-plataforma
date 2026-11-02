import { BaseRepository } from '../../core/db/BaseRepository.js';

// Lo que un estudiante (o su familia) puede ver: actividades publicadas de su sección,
// ya liberadas, y de unidades activas o cerradas (las futuras quedan ocultas).
const VISIBLE_ACTIVITY = `
      e.status = 'ACTIVE'
  AND a.status IN ('PUBLISHED', 'CLOSED')
  AND a.deleted_at IS NULL
  AND (a.publish_at IS NULL OR a.publish_at <= UTC_TIMESTAMP())
  AND u.status IN ('ACTIVE', 'CLOSED')`;

const ACTIVITY_JOINS = `
  FROM enrollments e
  JOIN courses c          ON c.school_id = e.school_id AND c.section_id = e.section_id AND c.is_active = 1
  JOIN subjects sub       ON sub.school_id = c.school_id AND sub.id = c.subject_id
  JOIN activities a       ON a.school_id = c.school_id AND a.course_id = c.id
  JOIN academic_units u   ON u.school_id = a.school_id AND u.id = a.academic_unit_id
  LEFT JOIN submissions s ON s.school_id = a.school_id AND s.activity_id = a.id AND s.student_id = e.student_id`;

const ACTIVITY_COLUMNS = `
  a.id, a.title, a.type, a.due_at, a.max_score, a.allow_late, a.status AS activity_status, a.course_id,
  sub.name AS subject_name, sub.color AS subject_color, u.id AS unit_id, u.name AS unit_name, u.status AS unit_status,
  s.id AS submission_id, s.status, s.attempt_count, s.score, s.last_submitted_at, s.is_late, s.reviewed_at, s.last_feedback`;

function toActivity(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    dueAt: row.due_at,
    maxScore: row.max_score,
    allowLate: Boolean(row.allow_late),
    isClosed: row.activity_status === 'CLOSED' || row.unit_status === 'CLOSED',
    subject: { name: row.subject_name, color: row.subject_color },
    unit: { id: row.unit_id, name: row.unit_name, status: row.unit_status },
    submission: {
      id: row.submission_id,
      // Inscrito después de publicar: aún sin fila, equivale a pendiente
      status: row.status ?? 'PENDING',
      attemptCount: row.attempt_count ?? 0,
      score: row.score ?? null,
      lastSubmittedAt: row.last_submitted_at ?? null,
      isLate: Boolean(row.is_late),
      reviewedAt: row.reviewed_at ?? null,
      lastFeedback: row.last_feedback ?? null,
    },
  };
}

class HomeworkRepository extends BaseRepository {
  async findStudentByUser(userId) {
    const row = await this.one(
      `SELECT id, student_code, first_name, last_name FROM students WHERE school_id = ? AND user_id = ? AND status = 'ACTIVE'`,
      [this.schoolId, userId],
    );
    return row && { id: row.id, code: row.student_code, firstName: row.first_name, lastName: row.last_name };
  }

  async findGuardedStudent(guardianId, studentId) {
    const row = await this.one(
      `SELECT st.id, st.student_code, st.first_name, st.last_name
         FROM guardian_students gs
         JOIN students st ON st.school_id = gs.school_id AND st.id = gs.student_id
        WHERE gs.school_id = ? AND gs.guardian_id = ? AND gs.student_id = ?`,
      [this.schoolId, guardianId, studentId],
    );
    return row && { id: row.id, code: row.student_code, firstName: row.first_name, lastName: row.last_name };
  }

  async listActivities(studentId) {
    const rows = await this.query(
      `SELECT ${ACTIVITY_COLUMNS} ${ACTIVITY_JOINS}
        WHERE e.school_id = ? AND e.student_id = ? AND ${VISIBLE_ACTIVITY}
        ORDER BY a.due_at IS NULL, a.due_at, a.id`,
      [this.schoolId, studentId],
    );
    return rows.map(toActivity);
  }

  async findActivity(studentId, activityId) {
    const row = await this.one(
      `SELECT ${ACTIVITY_COLUMNS}, a.description, a.requires_submission,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name, c.teacher_id
         ${ACTIVITY_JOINS}
         JOIN users t ON t.school_id = c.school_id AND t.id = c.teacher_id
        WHERE e.school_id = ? AND e.student_id = ? AND a.id = ? AND ${VISIBLE_ACTIVITY}`,
      [this.schoolId, studentId, activityId],
    );
    if (!row) return null;
    return {
      ...toActivity(row),
      description: row.description,
      requiresSubmission: Boolean(row.requires_submission),
      courseId: row.course_id,
      teacher: { id: row.teacher_id, name: `${row.teacher_first_name} ${row.teacher_last_name}` },
    };
  }

  async listActivityResources(activityId) {
    const rows = await this.query(
      `SELECT f.id, f.original_name, f.mime_type, f.size_bytes
         FROM activity_files af
         JOIN files f ON f.school_id = af.school_id AND f.id = af.file_id AND f.deleted_at IS NULL
        WHERE af.school_id = ? AND af.activity_id = ?
        ORDER BY f.id`,
      [this.schoolId, activityId],
    );
    return rows.map((row) => ({ id: row.id, name: row.original_name, mimeType: row.mime_type, size: row.size_bytes }));
  }

  /** Crea la fila PENDING si falta (inscripción posterior a la publicación). Idempotente. */
  async ensureSubmission(activityId, studentId, dueAt) {
    await this.query(
      `INSERT IGNORE INTO submissions (school_id, activity_id, student_id, next_reminder_at) VALUES (?, ?, ?, ?)`,
      [this.schoolId, activityId, studentId, dueAt],
    );
  }

  async lockSubmission(activityId, studentId) {
    const row = await this.one(
      `SELECT id, status, attempt_count, version FROM submissions
        WHERE school_id = ? AND activity_id = ? AND student_id = ?
        FOR UPDATE`,
      [this.schoolId, activityId, studentId],
    );
    return row && { id: row.id, status: row.status, attemptCount: row.attempt_count, version: row.version };
  }

  async insertAttempt({ submissionId, attemptNumber, comment, submittedBy, isLate }) {
    const result = await this.query(
      `INSERT INTO submission_attempts (school_id, submission_id, attempt_number, student_comment, submitted_by, is_late)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [this.schoolId, submissionId, attemptNumber, comment, submittedBy, isLate],
    );
    return result.insertId;
  }

  async linkAttemptFiles(attemptId, fileIds) {
    if (!fileIds.length) return;
    await this.query(
      `INSERT INTO submission_attempt_files (school_id, attempt_id, file_id) VALUES ${fileIds.map(() => '(?, ?, ?)').join(', ')}`,
      fileIds.flatMap((fileId) => [this.schoolId, attemptId, fileId]),
    );
  }

  /** Entregado: se detienen los recordatorios hasta que el docente revise. */
  async markSubmitted(submissionId, { attemptNumber, isLate }) {
    await this.query(
      `UPDATE submissions
          SET status = 'SUBMITTED', attempt_count = ?, last_submitted_at = UTC_TIMESTAMP(), is_late = ?,
              next_reminder_at = NULL, reminder_count = 0, version = version + 1
        WHERE school_id = ? AND id = ?`,
      [attemptNumber, isLate, this.schoolId, submissionId],
    );
  }

  async findGuardianUserIds(studentId) {
    const rows = await this.query(
      `SELECT guardian_id FROM guardian_students WHERE school_id = ? AND student_id = ? AND receives_notifications = 1`,
      [this.schoolId, studentId],
    );
    return rows.map((row) => row.guardian_id);
  }
}

export const homeworkRepository = new HomeworkRepository();
