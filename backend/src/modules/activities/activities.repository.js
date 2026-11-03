import { BaseRepository } from '../../core/db/BaseRepository.js';

const ACTIVITY_COLUMNS = `
  a.id, a.title, a.description, a.type, a.status, a.due_at, a.publish_at, a.max_score, a.allow_late, a.created_at,
  a.course_id, c.teacher_id, sub.name AS subject_name, sub.color AS subject_color,
  gl.short_name AS grade_name, sec.name AS section_name,
  u.id AS unit_id, u.name AS unit_name, u.status AS unit_status`;

const ACTIVITY_JOINS = `
  FROM activities a
  JOIN courses c        ON c.school_id = a.school_id AND c.id = a.course_id
  JOIN sections sec     ON sec.school_id = c.school_id AND sec.id = c.section_id
  JOIN grade_levels gl  ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
  JOIN subjects sub     ON sub.school_id = c.school_id AND sub.id = c.subject_id
  JOIN academic_units u ON u.school_id = a.school_id AND u.id = a.academic_unit_id`;

function toActivity(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    status: row.status,
    dueAt: row.due_at,
    publishAt: row.publish_at,
    maxScore: row.max_score,
    allowLate: Boolean(row.allow_late),
    createdAt: row.created_at,
    course: {
      id: row.course_id,
      name: `${row.grade_name} ${row.section_name} · ${row.subject_name}`,
      subject: row.subject_name,
      color: row.subject_color,
    },
    unit: { id: row.unit_id, name: row.unit_name, status: row.unit_status },
    teacherId: row.teacher_id,
  };
}

class ActivitiesRepository extends BaseRepository {
  /**
   * Actividades del ciclo activo con el avance de entregas.
   * Los conteos van en una subconsulta agrupada para no agrupar las columnas descriptivas.
   */
  async listForStaff({ teacherId, courseId, status }) {
    const params = [this.schoolId, this.schoolId];
    const filters = [];
    if (teacherId) {
      filters.push('c.teacher_id = ?');
      params.push(teacherId);
    }
    if (courseId) {
      filters.push('c.id = ?');
      params.push(courseId);
    }
    if (status) {
      filters.push('a.status = ?');
      params.push(status);
    }

    const rows = await this.query(
      `SELECT ${ACTIVITY_COLUMNS},
              COALESCE(s.total, 0) AS total, COALESCE(s.submitted, 0) AS submitted, COALESCE(s.rejected, 0) AS rejected,
              COALESCE(s.pending, 0) AS pending, COALESCE(s.approved, 0) AS approved,
              (SELECT COUNT(*) FROM activity_files af WHERE af.school_id = a.school_id AND af.activity_id = a.id) AS resources
         ${ACTIVITY_JOINS}
         JOIN academic_years ay ON ay.school_id = sec.school_id AND ay.id = sec.academic_year_id AND ay.status = 'ACTIVE'
         LEFT JOIN (
           SELECT activity_id, COUNT(*) AS total,
                  SUM(status = 'SUBMITTED') AS submitted, SUM(status = 'REJECTED') AS rejected,
                  SUM(status = 'PENDING') AS pending, SUM(status = 'APPROVED') AS approved
             FROM submissions WHERE school_id = ? GROUP BY activity_id
         ) s ON s.activity_id = a.id
        WHERE a.school_id = ? AND a.deleted_at IS NULL ${filters.map((filter) => `AND ${filter}`).join(' ')}
        ORDER BY FIELD(a.status, 'DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED'), a.due_at IS NULL, a.due_at DESC, a.id DESC`,
      params,
    );

    return rows.map((row) => {
      const { teacherId: _teacher, ...activity } = toActivity(row);
      return {
        ...activity,
        resourceCount: Number(row.resources),
        progress: {
          total: Number(row.total),
          submitted: Number(row.submitted),
          rejected: Number(row.rejected),
          pending: Number(row.pending),
          approved: Number(row.approved),
        },
      };
    });
  }

  async findForStaff(activityId) {
    const row = await this.one(`SELECT ${ACTIVITY_COLUMNS} ${ACTIVITY_JOINS} WHERE a.school_id = ? AND a.id = ? AND a.deleted_at IS NULL`, [
      this.schoolId,
      activityId,
    ]);
    return row && toActivity(row);
  }

  /** Unidad activa del ciclo del curso (o null si no hay). */
  async findActiveUnitForCourse(courseId) {
    const row = await this.one(
      `SELECT u.id FROM courses c
         JOIN sections sec     ON sec.school_id = c.school_id AND sec.id = c.section_id
         JOIN academic_units u ON u.school_id = sec.school_id AND u.academic_year_id = sec.academic_year_id AND u.status = 'ACTIVE'
        WHERE c.school_id = ? AND c.id = ?`,
      [this.schoolId, courseId],
    );
    return row?.id ?? null;
  }

  async insert(activity) {
    const result = await this.query(
      `INSERT INTO activities
         (school_id, course_id, academic_unit_id, created_by, title, description, type, status, allow_late, max_score, due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
      [
        this.schoolId,
        activity.courseId,
        activity.unitId,
        activity.createdBy,
        activity.title,
        activity.description,
        activity.type,
        activity.allowLate,
        activity.maxScore,
        activity.dueAt,
      ],
    );
    return result.insertId;
  }

  /** Columna del cuadro de notas ligada a la actividad: al aprobar, la nota se copia sola. */
  async insertLinkedGradeItem({ activityId, courseId, unitId, name, maxScore, weight, createdBy }) {
    await this.query(
      `INSERT INTO grade_items (school_id, course_id, academic_unit_id, activity_id, name, max_score, weight, sort_order, created_by)
       SELECT ?, ?, ?, ?, ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1, ?
         FROM grade_items WHERE school_id = ? AND course_id = ? AND academic_unit_id = ?`,
      [this.schoolId, courseId, unitId, activityId, name.slice(0, 100), maxScore, weight, createdBy, this.schoolId, courseId, unitId],
    );
  }

  async linkResources(activityId, fileIds) {
    if (!fileIds.length) return;
    await this.query(
      `INSERT INTO activity_files (school_id, activity_id, file_id) VALUES ${fileIds.map(() => '(?, ?, ?)').join(', ')}`,
      fileIds.flatMap((fileId) => [this.schoolId, activityId, fileId]),
    );
  }

  async update(activityId, { title, description, dueAt, allowLate, maxScore }) {
    await this.query(
      `UPDATE activities
          SET title = COALESCE(?, title), description = IF(?, ?, description), due_at = IF(?, ?, due_at),
              allow_late = COALESCE(?, allow_late), max_score = IF(?, ?, max_score)
        WHERE school_id = ? AND id = ?`,
      [
        title ?? null,
        description !== undefined,
        description ?? null,
        dueAt !== undefined,
        dueAt ?? null,
        allowLate ?? null,
        maxScore !== undefined,
        maxScore ?? null,
        this.schoolId,
        activityId,
      ],
    );
  }

  /** Si cambia el plazo, los recordatorios de lo pendiente se mueven con él. */
  async rescheduleReminders(activityId, dueAt) {
    await this.query(
      `UPDATE submissions SET next_reminder_at = ?, reminder_count = 0
        WHERE school_id = ? AND activity_id = ? AND status = 'PENDING'`,
      [dueAt, this.schoolId, activityId],
    );
  }

  /** Al reabrir: las pendientes vuelven a su fecha de entrega y las rechazadas retoman el ciclo ya. */
  async resumeReminders(activityId) {
    await this.query(
      `UPDATE submissions s
         JOIN activities a ON a.school_id = s.school_id AND a.id = s.activity_id
          SET s.next_reminder_at = IF(s.status = 'REJECTED', UTC_TIMESTAMP(), a.due_at), s.reminder_count = 0
        WHERE s.school_id = ? AND s.activity_id = ? AND s.status IN ('PENDING', 'REJECTED') AND s.next_reminder_at IS NULL`,
      [this.schoolId, activityId],
    );
  }

  async setStatus(activityId, from, to) {
    const result = await this.query(`UPDATE activities SET status = ? WHERE school_id = ? AND id = ? AND status = ?`, [
      to,
      this.schoolId,
      activityId,
      from,
    ]);
    return result.affectedRows === 1;
  }

  /** Una entrega PENDING por estudiante inscrito: así "sin entregar" es un dato y el cron la ve. */
  async createPendingSubmissions(activityId, courseId, dueAt) {
    const result = await this.query(
      `INSERT IGNORE INTO submissions (school_id, activity_id, student_id, next_reminder_at)
       SELECT e.school_id, ?, e.student_id, ?
         FROM courses c
         JOIN enrollments e ON e.school_id = c.school_id AND e.section_id = c.section_id AND e.status = 'ACTIVE'
        WHERE c.school_id = ? AND c.id = ?`,
      [activityId, dueAt, this.schoolId, courseId],
    );
    return result.affectedRows;
  }

  async findStudentUserIds(courseId) {
    const rows = await this.query(
      `SELECT st.user_id
         FROM courses c
         JOIN enrollments e ON e.school_id = c.school_id AND e.section_id = c.section_id AND e.status = 'ACTIVE'
         JOIN students st   ON st.school_id = e.school_id AND st.id = e.student_id AND st.user_id IS NOT NULL
        WHERE c.school_id = ? AND c.id = ?`,
      [this.schoolId, courseId],
    );
    return rows.map((row) => row.user_id);
  }

  /** Familiares (con avisos activados) de los estudiantes inscritos en la sección del curso. */
  async findGuardiansOfCourse(courseId) {
    const rows = await this.query(
      `SELECT gs.guardian_id, st.id AS student_id, st.first_name
         FROM courses c
         JOIN enrollments e        ON e.school_id = c.school_id AND e.section_id = c.section_id AND e.status = 'ACTIVE'
         JOIN students st          ON st.school_id = e.school_id AND st.id = e.student_id
         JOIN guardian_students gs ON gs.school_id = st.school_id AND gs.student_id = st.id AND gs.receives_notifications = 1
        WHERE c.school_id = ? AND c.id = ?`,
      [this.schoolId, courseId],
    );
    return rows.map((row) => ({ guardianId: row.guardian_id, studentId: row.student_id, studentName: row.first_name }));
  }

  async deleteDraft(activityId) {
    const result = await this.query(`DELETE FROM activities WHERE school_id = ? AND id = ? AND status = 'DRAFT'`, [this.schoolId, activityId]);
    return result.affectedRows === 1;
  }
}

export const activitiesRepository = new ActivitiesRepository();
