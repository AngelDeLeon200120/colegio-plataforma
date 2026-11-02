import { BaseRepository } from '../../core/db/BaseRepository.js';

const UPDATABLE = { code: 'student_code', firstName: 'first_name', lastName: 'last_name', birthDate: 'birth_date', status: 'status' };

class AdminStudentsRepository extends BaseRepository {
  async findActiveYearId() {
    const row = await this.one(`SELECT id FROM academic_years WHERE school_id = ? AND status = 'ACTIVE'`, [this.schoolId]);
    return row?.id ?? null;
  }

  /** Expedientes con su cuenta (si tiene) y su inscripción del ciclo activo. */
  async list({ q, sectionId, yearId, studentId }) {
    const params = [yearId, this.schoolId];
    let filters = '';
    if (studentId) {
      filters += ' AND st.id = ?';
      params.push(studentId);
    }
    if (sectionId) {
      filters += ' AND e.section_id = ?';
      params.push(sectionId);
    }
    if (q) {
      filters += ' AND (st.first_name LIKE ? OR st.last_name LIKE ? OR st.student_code LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const rows = await this.query(
      `SELECT st.id, st.student_code, st.first_name, st.last_name, st.birth_date, st.status,
              st.user_id, u.email, u.status AS account_status,
              e.id AS enrollment_id, e.section_id, e.status AS enrollment_status,
              CONCAT(gl.short_name, ' ', sec.name) AS section_label
         FROM students st
         LEFT JOIN users u         ON u.school_id = st.school_id AND u.id = st.user_id
         LEFT JOIN enrollments e   ON e.school_id = st.school_id AND e.student_id = st.id AND e.academic_year_id = ?
         LEFT JOIN sections sec    ON sec.school_id = e.school_id AND sec.id = e.section_id
         LEFT JOIN grade_levels gl ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
        WHERE st.school_id = ? ${filters}
        ORDER BY st.last_name, st.first_name
        LIMIT 1000`,
      params,
    );
    return rows.map((row) => ({
      id: row.id,
      code: row.student_code,
      firstName: row.first_name,
      lastName: row.last_name,
      birthDate: row.birth_date,
      status: row.status,
      account: row.user_id ? { userId: row.user_id, email: row.email, status: row.account_status } : null,
      enrollment: row.enrollment_id
        ? { id: row.enrollment_id, sectionId: row.section_id, section: row.section_label, status: row.enrollment_status }
        : null,
    }));
  }

  async guardiansByStudent() {
    const rows = await this.query(
      `SELECT gs.student_id, gs.guardian_id, gs.relationship, gs.is_financial_responsible, gs.receives_notifications,
              u.first_name, u.last_name, u.email
         FROM guardian_students gs
         JOIN users u ON u.school_id = gs.school_id AND u.id = gs.guardian_id
        WHERE gs.school_id = ?`,
      [this.schoolId],
    );
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.student_id)) map.set(row.student_id, []);
      map.get(row.student_id).push({
        id: row.guardian_id,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        relationship: row.relationship,
        isFinancialResponsible: Boolean(row.is_financial_responsible),
        receivesNotifications: Boolean(row.receives_notifications),
      });
    }
    return map;
  }

  async findStudent(studentId) {
    const row = await this.one('SELECT id, user_id, first_name, last_name FROM students WHERE school_id = ? AND id = ?', [this.schoolId, studentId]);
    return row && { id: row.id, userId: row.user_id, firstName: row.first_name, lastName: row.last_name };
  }

  async insert({ code, firstName, lastName, birthDate }) {
    const result = await this.query(
      'INSERT INTO students (school_id, student_code, first_name, last_name, birth_date) VALUES (?, ?, ?, ?, ?)',
      [this.schoolId, code, firstName, lastName, birthDate ?? null],
    );
    return result.insertId;
  }

  async update(studentId, fields) {
    const entries = Object.entries(fields).filter(([key, value]) => UPDATABLE[key] && value !== undefined);
    if (!entries.length) return;
    await this.query(`UPDATE students SET ${entries.map(([key]) => `${UPDATABLE[key]} = ?`).join(', ')} WHERE school_id = ? AND id = ?`, [
      ...entries.map(([, value]) => value),
      this.schoolId,
      studentId,
    ]);
  }

  async linkAccount(studentId, userId) {
    await this.query('UPDATE students SET user_id = ? WHERE school_id = ? AND id = ?', [userId, this.schoolId, studentId]);
  }

  // --- Inscripción -----------------------------------------------------------

  async findSectionInYear(sectionId, yearId) {
    const row = await this.one('SELECT id FROM sections WHERE school_id = ? AND id = ? AND academic_year_id = ?', [this.schoolId, sectionId, yearId]);
    return Boolean(row);
  }

  async findEnrollment(studentId, yearId) {
    const row = await this.one(
      'SELECT id, section_id, status FROM enrollments WHERE school_id = ? AND student_id = ? AND academic_year_id = ? FOR UPDATE',
      [this.schoolId, studentId, yearId],
    );
    return row && { id: row.id, sectionId: row.section_id, status: row.status };
  }

  async insertEnrollment(studentId, sectionId, yearId, today) {
    await this.query(
      'INSERT INTO enrollments (school_id, student_id, section_id, academic_year_id, enrolled_on) VALUES (?, ?, ?, ?, ?)',
      [this.schoolId, studentId, sectionId, yearId, today],
    );
  }

  /** Un solo registro por estudiante y ciclo: trasladar o reinscribir actualiza el mismo. */
  async moveEnrollment(enrollmentId, sectionId, today) {
    await this.query(
      `UPDATE enrollments SET section_id = ?, status = 'ACTIVE', enrolled_on = ?, ended_on = NULL WHERE school_id = ? AND id = ?`,
      [sectionId, today, this.schoolId, enrollmentId],
    );
  }

  async withdrawEnrollment(enrollmentId, today) {
    await this.query(`UPDATE enrollments SET status = 'WITHDRAWN', ended_on = ? WHERE school_id = ? AND id = ?`, [today, this.schoolId, enrollmentId]);
  }

  /** Al salir de una sección dejan de correr los recordatorios de sus tareas pendientes. */
  async stopRemindersInSection(studentId, sectionId) {
    await this.query(
      `UPDATE submissions s
         JOIN activities a ON a.school_id = s.school_id AND a.id = s.activity_id
         JOIN courses c    ON c.school_id = a.school_id AND c.id = a.course_id
          SET s.next_reminder_at = NULL
        WHERE s.school_id = ? AND s.student_id = ? AND c.section_id = ? AND s.status IN ('PENDING', 'REJECTED')`,
      [this.schoolId, studentId, sectionId],
    );
  }

  /**
   * Al entrar a una sección: entregas PENDING de las tareas publicadas que aún no vencen
   * (lo ya vencido se ve en su agenda, pero no se le recuerda: llegó después).
   */
  async createPendingForSection(studentId, sectionId) {
    const result = await this.query(
      `INSERT IGNORE INTO submissions (school_id, activity_id, student_id, next_reminder_at)
       SELECT a.school_id, a.id, ?, a.due_at
         FROM activities a
         JOIN courses c        ON c.school_id = a.school_id AND c.id = a.course_id
         JOIN academic_units u ON u.school_id = a.school_id AND u.id = a.academic_unit_id AND u.status = 'ACTIVE'
        WHERE a.school_id = ? AND c.section_id = ? AND a.status = 'PUBLISHED' AND a.deleted_at IS NULL
          AND (a.due_at IS NULL OR a.due_at > UTC_TIMESTAMP())`,
      [studentId, this.schoolId, sectionId],
    );
    return result.affectedRows;
  }

  // --- Familias --------------------------------------------------------------

  async findParent(userId) {
    const row = await this.one(`SELECT id FROM users WHERE school_id = ? AND id = ? AND role = 'PARENT' AND deleted_at IS NULL`, [
      this.schoolId,
      userId,
    ]);
    return Boolean(row);
  }

  async upsertGuardian(studentId, { guardianId, relationship, isFinancialResponsible, receivesNotifications }) {
    await this.query(
      `INSERT INTO guardian_students (school_id, guardian_id, student_id, relationship, is_financial_responsible, receives_notifications)
       VALUES (?, ?, ?, ?, ?, ?) AS incoming
       ON DUPLICATE KEY UPDATE relationship = incoming.relationship,
                               is_financial_responsible = incoming.is_financial_responsible,
                               receives_notifications = incoming.receives_notifications`,
      [this.schoolId, guardianId, studentId, relationship, isFinancialResponsible, receivesNotifications],
    );
  }

  async removeGuardian(studentId, guardianId) {
    const result = await this.query('DELETE FROM guardian_students WHERE school_id = ? AND student_id = ? AND guardian_id = ?', [
      this.schoolId,
      studentId,
      guardianId,
    ]);
    return result.affectedRows === 1;
  }
}

export const adminStudentsRepository = new AdminStudentsRepository();
