import { BaseRepository } from '../../core/db/BaseRepository.js';
import { sectionVisibility } from '../academic/academic.visibility.js';

// Al llegar a este número de reportes en el ciclo (y a sus múltiplos) se abre un seguimiento
export const FOLLOWUP_THRESHOLD = 3;

const REPORT_COLUMNS = `
  r.id, r.student_id, r.section_id, r.category, r.description, r.incident_date, r.status, r.void_reason, r.voided_at, r.created_at,
  st.first_name, st.last_name, st.student_code,
  CONCAT(gl.short_name, ' ', sec.name) AS section_name,
  au.first_name AS author_first, au.last_name AS author_last, au.role AS author_role`;

const REPORT_JOINS = `
  FROM conduct_reports r
  JOIN students st     ON st.school_id = r.school_id AND st.id = r.student_id
  JOIN sections sec    ON sec.school_id = r.school_id AND sec.id = r.section_id
  JOIN grade_levels gl ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
  JOIN users au        ON au.school_id = r.school_id AND au.id = r.reported_by`;

const toReport = (row) => ({
  id: row.id,
  category: row.category,
  description: row.description,
  incidentDate: row.incident_date,
  status: row.status,
  voidReason: row.void_reason,
  voidedAt: row.voided_at,
  createdAt: row.created_at,
  student: { id: row.student_id, firstName: row.first_name, lastName: row.last_name, code: row.student_code },
  section: { id: row.section_id, name: row.section_name },
  reportedBy: { name: `${row.author_first} ${row.author_last}`, role: row.author_role },
});

const toFollowup = (row) => ({
  id: row.id,
  studentId: row.student_id,
  reportCount: row.report_count,
  status: row.status,
  decision: row.decision,
  meetingAt: row.meeting_at,
  notes: row.notes,
  outcome: row.outcome,
  handledBy: row.handler_first ? `${row.handler_first} ${row.handler_last}` : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ...(row.first_name !== undefined && {
    student: { id: row.student_id, firstName: row.first_name, lastName: row.last_name, code: row.student_code },
    section: row.section_name ? { name: row.section_name } : null,
  }),
});

class ConductRepository extends BaseRepository {
  async findActiveYearId() {
    const row = await this.one(`SELECT id FROM academic_years WHERE school_id = ? AND status = 'ACTIVE'`, [this.schoolId]);
    return row?.id ?? null;
  }

  /** Estudiante con su sección del ciclo activo. */
  async findEnrolledStudent(studentId, yearId) {
    const row = await this.one(
      `SELECT st.id, st.first_name, st.last_name, e.section_id, sec.homeroom_teacher_id, CONCAT(gl.short_name, ' ', sec.name) AS section_name
         FROM students st
         JOIN enrollments e   ON e.school_id = st.school_id AND e.student_id = st.id AND e.academic_year_id = ? AND e.status = 'ACTIVE'
         JOIN sections sec    ON sec.school_id = e.school_id AND sec.id = e.section_id
         JOIN grade_levels gl ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
        WHERE st.school_id = ? AND st.id = ?`,
      [yearId, this.schoolId, studentId],
    );
    return (
      row && {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        sectionId: row.section_id,
        sectionName: row.section_name,
        homeroomTeacherId: row.homeroom_teacher_id,
      }
    );
  }

  /** ¿La persona del personal puede reportar en esa sección? (docente: donde dicta o es guía) */
  async canReportInSection(user, sectionId) {
    const visible = sectionVisibility(user, 'sec.id');
    const row = await this.one(`SELECT 1 AS ok FROM sections sec WHERE sec.school_id = ? AND sec.id = ? AND ${visible.sql}`, [
      this.schoolId,
      sectionId,
      ...visible.params,
    ]);
    return Boolean(row);
  }

  /** Secciones y estudiantes a los que la persona puede reportar, con su contador del ciclo. */
  async listStudents(user, yearId, { sectionId } = {}) {
    const visible = sectionVisibility(user, 'sec.id');
    const rows = await this.query(
      `SELECT st.id, st.first_name, st.last_name, st.student_code, sec.id AS section_id, CONCAT(gl.short_name, ' ', sec.name) AS section_name,
              (SELECT COUNT(*) FROM conduct_reports r
                WHERE r.school_id = st.school_id AND r.student_id = st.id AND r.academic_year_id = e.academic_year_id AND r.status = 'ACTIVE') AS report_count,
              (SELECT f.status FROM conduct_followups f
                WHERE f.school_id = st.school_id AND f.student_id = st.id AND f.academic_year_id = e.academic_year_id
                ORDER BY f.report_count DESC LIMIT 1) AS followup_status
         FROM enrollments e
         JOIN students st     ON st.school_id = e.school_id AND st.id = e.student_id
         JOIN sections sec    ON sec.school_id = e.school_id AND sec.id = e.section_id
         JOIN grade_levels gl ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
        WHERE e.school_id = ? AND e.academic_year_id = ? AND e.status = 'ACTIVE' AND ${visible.sql}
          ${sectionId ? 'AND sec.id = ?' : ''}
        ORDER BY gl.sort_order, sec.name, st.last_name, st.first_name`,
      [this.schoolId, yearId, ...visible.params, ...(sectionId ? [sectionId] : [])],
    );
    return rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      code: row.student_code,
      section: { id: row.section_id, name: row.section_name },
      reportCount: Number(row.report_count),
      followupStatus: row.followup_status,
    }));
  }

  async listReports(user, yearId, { studentId, sectionId, category, includeVoid }) {
    const visible = sectionVisibility(user, 'r.section_id');
    const filters = [];
    const params = [this.schoolId, yearId, ...visible.params];
    if (studentId) {
      filters.push('AND r.student_id = ?');
      params.push(studentId);
    }
    if (sectionId) {
      filters.push('AND r.section_id = ?');
      params.push(sectionId);
    }
    if (category) {
      filters.push('AND r.category = ?');
      params.push(category);
    }
    if (!includeVoid) filters.push("AND r.status = 'ACTIVE'");
    const rows = await this.query(
      `SELECT ${REPORT_COLUMNS} ${REPORT_JOINS}
        WHERE r.school_id = ? AND r.academic_year_id = ? AND ${visible.sql} ${filters.join(' ')}
        ORDER BY r.incident_date DESC, r.id DESC
        LIMIT 500`,
      params,
    );
    return rows.map(toReport);
  }

  /** Reportes vigentes de un estudiante (vista de la familia). */
  async listStudentReports(studentId, yearId) {
    const rows = await this.query(
      `SELECT ${REPORT_COLUMNS} ${REPORT_JOINS}
        WHERE r.school_id = ? AND r.student_id = ? AND r.academic_year_id = ? AND r.status = 'ACTIVE'
        ORDER BY r.incident_date DESC, r.id DESC`,
      [this.schoolId, studentId, yearId],
    );
    return rows.map(toReport);
  }

  async findReport(reportId) {
    const row = await this.one(`SELECT ${REPORT_COLUMNS}, r.academic_year_id ${REPORT_JOINS} WHERE r.school_id = ? AND r.id = ?`, [this.schoolId, reportId]);
    return row && { ...toReport(row), academicYearId: row.academic_year_id };
  }

  async insertReport({ yearId, studentId, sectionId, category, description, incidentDate, reportedBy }) {
    const result = await this.query(
      `INSERT INTO conduct_reports (school_id, academic_year_id, student_id, section_id, category, description, incident_date, reported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [this.schoolId, yearId, studentId, sectionId, category, description, incidentDate, reportedBy],
    );
    return result.insertId;
  }

  /** Bloquea los reportes del estudiante en el ciclo: dos reportes simultáneos no saltan el umbral. */
  async countActiveForUpdate(studentId, yearId) {
    const rows = await this.query(
      `SELECT id FROM conduct_reports WHERE school_id = ? AND student_id = ? AND academic_year_id = ? AND status = 'ACTIVE' FOR UPDATE`,
      [this.schoolId, studentId, yearId],
    );
    return rows.length;
  }

  async voidReport(reportId, { reason, voidedBy }) {
    const result = await this.query(
      `UPDATE conduct_reports SET status = 'VOID', void_reason = ?, voided_by = ?, voided_at = UTC_TIMESTAMP()
        WHERE school_id = ? AND id = ? AND status = 'ACTIVE'`,
      [reason, voidedBy, this.schoolId, reportId],
    );
    return result.affectedRows > 0;
  }

  /** Abre el seguimiento de ese escalón (3, 6, 9...). Devuelve el id o null si ya existía. */
  async openFollowup({ yearId, studentId, reportCount }) {
    const result = await this.query(
      `INSERT IGNORE INTO conduct_followups (school_id, academic_year_id, student_id, report_count) VALUES (?, ?, ?, ?)`,
      [this.schoolId, yearId, studentId, reportCount],
    );
    return result.affectedRows ? result.insertId : null;
  }

  async listFollowups(user, yearId, { status }) {
    const visible = sectionVisibility(user, 'e.section_id');
    const rows = await this.query(
      `SELECT f.*, st.first_name, st.last_name, st.student_code, CONCAT(gl.short_name, ' ', sec.name) AS section_name,
              hu.first_name AS handler_first, hu.last_name AS handler_last
         FROM conduct_followups f
         JOIN students st     ON st.school_id = f.school_id AND st.id = f.student_id
         JOIN enrollments e   ON e.school_id = f.school_id AND e.student_id = f.student_id AND e.academic_year_id = f.academic_year_id
         JOIN sections sec    ON sec.school_id = e.school_id AND sec.id = e.section_id
         JOIN grade_levels gl ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
         LEFT JOIN users hu   ON hu.school_id = f.school_id AND hu.id = f.handled_by
        WHERE f.school_id = ? AND f.academic_year_id = ? AND ${visible.sql} ${status ? 'AND f.status = ?' : ''}
        ORDER BY FIELD(f.status, 'PENDIENTE', 'PROGRAMADO', 'RESUELTO'), f.created_at DESC
        LIMIT 300`,
      [this.schoolId, yearId, ...visible.params, ...(status ? [status] : [])],
    );
    return rows.map(toFollowup);
  }

  async listStudentFollowups(studentId, yearId) {
    const rows = await this.query(
      `SELECT f.*, hu.first_name AS handler_first, hu.last_name AS handler_last
         FROM conduct_followups f
         LEFT JOIN users hu ON hu.school_id = f.school_id AND hu.id = f.handled_by
        WHERE f.school_id = ? AND f.student_id = ? AND f.academic_year_id = ?
        ORDER BY f.report_count DESC`,
      [this.schoolId, studentId, yearId],
    );
    return rows.map(toFollowup);
  }

  async findFollowup(followupId) {
    const row = await this.one(
      `SELECT f.*, hu.first_name AS handler_first, hu.last_name AS handler_last
         FROM conduct_followups f
         LEFT JOIN users hu ON hu.school_id = f.school_id AND hu.id = f.handled_by
        WHERE f.school_id = ? AND f.id = ?`,
      [this.schoolId, followupId],
    );
    return row && toFollowup(row);
  }

  async updateFollowup(followupId, fields, handledBy) {
    const columns = { status: 'status', decision: 'decision', meetingAt: 'meeting_at', notes: 'notes', outcome: 'outcome' };
    const entries = Object.entries(fields).filter(([key, value]) => columns[key] && value !== undefined);
    await this.query(
      `UPDATE conduct_followups SET ${[...entries.map(([key]) => `${columns[key]} = ?`), 'handled_by = ?'].join(', ')} WHERE school_id = ? AND id = ?`,
      [...entries.map(([, value]) => value), handledBy, this.schoolId, followupId],
    );
  }

  // --- Destinatarios ---------------------------------------------------------

  async findGuardianIds(studentId) {
    const rows = await this.query(
      `SELECT guardian_id FROM guardian_students WHERE school_id = ? AND student_id = ? AND receives_notifications = 1`,
      [this.schoolId, studentId],
    );
    return rows.map((row) => row.guardian_id);
  }

  async findAdminIds() {
    const rows = await this.query(`SELECT id FROM users WHERE school_id = ? AND role = 'ADMIN' AND status = 'ACTIVE' AND deleted_at IS NULL`, [this.schoolId]);
    return rows.map((row) => row.id);
  }

  async isGuardian(guardianId, studentId) {
    return Boolean(
      await this.one('SELECT 1 AS ok FROM guardian_students WHERE school_id = ? AND guardian_id = ? AND student_id = ?', [this.schoolId, guardianId, studentId]),
    );
  }
}

export const conductRepository = new ConductRepository();
