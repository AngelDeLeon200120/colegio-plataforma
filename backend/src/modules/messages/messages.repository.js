import { BaseRepository } from '../../core/db/BaseRepository.js';

const SECTION_LABEL = `CONCAT(gl.short_name, ' ', sec.name)`;

// Secciones donde el docente da algún curso (sobre una tabla con school_id en `alias`)
const teacherSections = (alias) =>
  `SELECT c.section_id FROM courses c WHERE c.school_id = ${alias}.school_id AND c.teacher_id = ? AND c.is_active = 1`;

/**
 * Qué hilos puede ver cada rol (sobre el alias `t`).
 *  - Administración: todos.
 *  - Docente: los de las secciones donde da algún curso.
 *  - Familia y estudiante: los de su(s) estudiante(s) y los avisos a la sección donde están inscritos.
 */
function visibility(user) {
  switch (user.role) {
    case 'ADMIN':
      return { sql: 'TRUE', params: [] };
    case 'TEACHER':
      return { sql: `t.section_id IN (${teacherSections('t')})`, params: [user.id] };
    case 'PARENT':
      return {
        sql: `((t.scope = 'STUDENT' AND t.student_id IN (
                  SELECT gs.student_id FROM guardian_students gs WHERE gs.school_id = t.school_id AND gs.guardian_id = ?))
               OR (t.scope = 'SECTION' AND t.section_id IN (
                  SELECT e.section_id FROM enrollments e
                    JOIN guardian_students gs ON gs.school_id = e.school_id AND gs.student_id = e.student_id
                   WHERE e.school_id = t.school_id AND gs.guardian_id = ? AND e.status = 'ACTIVE')))`,
        params: [user.id, user.id],
      };
    case 'STUDENT':
      return {
        sql: `((t.scope = 'STUDENT' AND t.student_id IN (
                  SELECT st.id FROM students st WHERE st.school_id = t.school_id AND st.user_id = ?))
               OR (t.scope = 'SECTION' AND t.section_id IN (
                  SELECT e.section_id FROM enrollments e
                    JOIN students st ON st.school_id = e.school_id AND st.id = e.student_id
                   WHERE e.school_id = t.school_id AND st.user_id = ? AND e.status = 'ACTIVE')))`,
        params: [user.id, user.id],
      };
    default:
      return { sql: 'FALSE', params: [] };
  }
}

// Sin leer: hay mensajes de otras personas después del último que leyó
const UNREAD = `EXISTS (
  SELECT 1 FROM messages m
   WHERE m.school_id = t.school_id AND m.thread_id = t.id AND m.author_id <> ?
     AND m.id > COALESCE((SELECT r.last_read_message_id FROM message_reads r
                           WHERE r.school_id = t.school_id AND r.thread_id = t.id AND r.user_id = ?), 0))`;

const THREAD_COLUMNS = `
  t.id, t.scope, t.student_id, t.section_id, t.topic, t.reason, t.subject, t.created_by, t.last_message_at, t.created_at,
  ${SECTION_LABEL} AS section_label,
  st.first_name AS student_first_name, st.last_name AS student_last_name,
  au.first_name AS author_first_name, au.last_name AS author_last_name, au.role AS author_role,
  lm.body AS last_body, lm.author_id AS last_author_id, lu.first_name AS last_author_first_name`;

const THREAD_JOINS = `
  FROM message_threads t
  JOIN sections sec     ON sec.school_id = t.school_id AND sec.id = t.section_id
  JOIN grade_levels gl  ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
  JOIN users au         ON au.school_id = t.school_id AND au.id = t.created_by
  LEFT JOIN students st ON st.school_id = t.school_id AND st.id = t.student_id
  LEFT JOIN messages lm ON lm.school_id = t.school_id AND lm.id = t.last_message_id
  LEFT JOIN users lu    ON lu.school_id = lm.school_id AND lu.id = lm.author_id`;

const toThread = (row) => ({
  id: row.id,
  scope: row.scope,
  topic: row.topic,
  reason: row.reason,
  subject: row.subject,
  section: { id: row.section_id, name: row.section_label },
  student: row.student_id ? { id: row.student_id, firstName: row.student_first_name, lastName: row.student_last_name } : null,
  createdBy: { id: row.created_by, firstName: row.author_first_name, lastName: row.author_last_name, role: row.author_role },
  lastMessage: row.last_body ? { preview: row.last_body.slice(0, 160), authorId: row.last_author_id, authorFirstName: row.last_author_first_name } : null,
  lastMessageAt: row.last_message_at,
  createdAt: row.created_at,
  ...(row.unread !== undefined && { unread: Boolean(row.unread) }),
});

const placeholders = (list) => list.map(() => '?').join(', ');

class MessagesRepository extends BaseRepository {
  async listThreads(user, { topic, reason }) {
    const visible = visibility(user);
    const filters = [];
    const params = [];
    if (topic) {
      filters.push('AND t.topic = ?');
      params.push(topic);
    }
    if (reason) {
      filters.push('AND t.reason = ?');
      params.push(reason);
    }

    const rows = await this.query(
      `SELECT ${THREAD_COLUMNS}, ${UNREAD} AS unread ${THREAD_JOINS}
        WHERE t.school_id = ? AND ${visible.sql} ${filters.join(' ')}
        ORDER BY t.last_message_at DESC, t.id DESC
        LIMIT 200`,
      [user.id, user.id, this.schoolId, ...visible.params, ...params],
    );
    return rows.map(toThread);
  }

  async findVisibleThread(user, threadId) {
    const visible = visibility(user);
    const row = await this.one(`SELECT ${THREAD_COLUMNS} ${THREAD_JOINS} WHERE t.school_id = ? AND t.id = ? AND ${visible.sql}`, [
      this.schoolId,
      threadId,
      ...visible.params,
    ]);
    return row && toThread(row);
  }

  async countUnreadThreads(user) {
    const visible = visibility(user);
    const row = await this.one(`SELECT COUNT(*) AS total FROM message_threads t WHERE t.school_id = ? AND ${visible.sql} AND ${UNREAD}`, [
      this.schoolId,
      ...visible.params,
      user.id,
      user.id,
    ]);
    return Number(row.total);
  }

  async listMessages(threadId) {
    const rows = await this.query(
      `SELECT m.id, m.body, m.created_at, u.id AS author_id, u.first_name, u.last_name, u.role
         FROM messages m
         JOIN users u ON u.school_id = m.school_id AND u.id = m.author_id
        WHERE m.school_id = ? AND m.thread_id = ?
        ORDER BY m.id`,
      [this.schoolId, threadId],
    );
    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.created_at,
      author: { id: row.author_id, firstName: row.first_name, lastName: row.last_name, role: row.role },
    }));
  }

  async createThread({ scope, studentId, sectionId, topic, reason, subject, createdBy }) {
    const result = await this.query(
      `INSERT INTO message_threads (school_id, scope, student_id, section_id, topic, reason, subject, created_by, last_message_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
      [this.schoolId, scope, studentId ?? null, sectionId, topic, reason, subject, createdBy],
    );
    return result.insertId;
  }

  async insertMessage(threadId, authorId, body) {
    const result = await this.query(
      `INSERT INTO messages (school_id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
      [this.schoolId, threadId, authorId, body],
    );
    await this.query(`UPDATE message_threads SET last_message_id = ?, last_message_at = UTC_TIMESTAMP() WHERE school_id = ? AND id = ?`, [
      result.insertId,
      this.schoolId,
      threadId,
    ]);
    return result.insertId;
  }

  async markRead(threadId, userId) {
    await this.query(
      `INSERT INTO message_reads (school_id, thread_id, user_id, last_read_message_id)
       SELECT t.school_id, t.id, ?, t.last_message_id FROM message_threads t
        WHERE t.school_id = ? AND t.id = ? AND t.last_message_id IS NOT NULL
       ON DUPLICATE KEY UPDATE last_read_message_id = GREATEST(message_reads.last_read_message_id, VALUES(last_read_message_id))`,
      [userId, this.schoolId, threadId],
    );
  }

  async findAuthor(userId) {
    const row = await this.one(`SELECT id, first_name, last_name FROM users WHERE school_id = ? AND id = ?`, [this.schoolId, userId]);
    return { id: row.id, firstName: row.first_name, lastName: row.last_name };
  }

  // --- A quién se puede escribir -------------------------------------------

  async findTeacherSectionIds(teacherId) {
    const rows = await this.query(`SELECT DISTINCT section_id FROM courses WHERE school_id = ? AND teacher_id = ? AND is_active = 1`, [
      this.schoolId,
      teacherId,
    ]);
    return rows.map((row) => row.section_id);
  }

  /** Secciones del ciclo activo: todas (null) o solo las indicadas. */
  async listActiveSections(sectionIds = null) {
    if (sectionIds && !sectionIds.length) return [];
    const rows = await this.query(
      `SELECT sec.id, ${SECTION_LABEL} AS label
         FROM sections sec
         JOIN grade_levels gl   ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
         JOIN academic_years ay ON ay.school_id = sec.school_id AND ay.id = sec.academic_year_id AND ay.status = 'ACTIVE'
        WHERE sec.school_id = ? ${sectionIds ? `AND sec.id IN (${placeholders(sectionIds)})` : ''}
        ORDER BY gl.sort_order, sec.name`,
      [this.schoolId, ...(sectionIds ?? [])],
    );
    return rows.map((row) => ({ id: row.id, name: row.label }));
  }

  /** Estudiantes con inscripción activa en las secciones indicadas. */
  async listStudentsInSections(sectionIds) {
    if (!sectionIds.length) return [];
    const rows = await this.query(
      `SELECT st.id, st.first_name, st.last_name, e.section_id
         FROM enrollments e
         JOIN students st ON st.school_id = e.school_id AND st.id = e.student_id AND st.status = 'ACTIVE'
        WHERE e.school_id = ? AND e.status = 'ACTIVE' AND e.section_id IN (${placeholders(sectionIds)})
        ORDER BY st.last_name, st.first_name`,
      [this.schoolId, ...sectionIds],
    );
    return rows.map((row) => ({ id: row.id, firstName: row.first_name, lastName: row.last_name, sectionId: row.section_id }));
  }

  /** Estudiante con su sección actual, solo si esta persona puede escribir sobre él. */
  async findStudentForUser(user, studentId) {
    const access =
      {
        ADMIN: { sql: 'TRUE', params: [] },
        TEACHER: { sql: `e.section_id IN (${teacherSections('e')})`, params: [user.id] },
        PARENT: {
          sql: 'EXISTS (SELECT 1 FROM guardian_students gs WHERE gs.school_id = st.school_id AND gs.student_id = st.id AND gs.guardian_id = ?)',
          params: [user.id],
        },
        STUDENT: { sql: 'st.user_id = ?', params: [user.id] },
      }[user.role] ?? { sql: 'FALSE', params: [] };

    const row = await this.one(
      `SELECT st.id, st.first_name, st.last_name, e.section_id
         FROM students st
         JOIN enrollments e ON e.school_id = st.school_id AND e.student_id = st.id AND e.status = 'ACTIVE'
        WHERE st.school_id = ? AND st.id = ? AND ${access.sql}
        ORDER BY e.enrolled_on DESC
        LIMIT 1`,
      [this.schoolId, studentId, ...access.params],
    );
    return row && { id: row.id, firstName: row.first_name, lastName: row.last_name, sectionId: row.section_id };
  }

  /** Hijos e hijas (familia) o el propio expediente (estudiante), con su sección actual. */
  async listOwnStudents(user) {
    const filter =
      user.role === 'PARENT'
        ? 'EXISTS (SELECT 1 FROM guardian_students gs WHERE gs.school_id = st.school_id AND gs.student_id = st.id AND gs.guardian_id = ?)'
        : 'st.user_id = ?';
    const rows = await this.query(
      `SELECT st.id, st.first_name, st.last_name, e.section_id
         FROM students st
         JOIN enrollments e ON e.school_id = st.school_id AND e.student_id = st.id AND e.status = 'ACTIVE'
        WHERE st.school_id = ? AND ${filter}
        ORDER BY st.first_name`,
      [this.schoolId, user.id],
    );
    return rows.map((row) => ({ id: row.id, firstName: row.first_name, lastName: row.last_name, sectionId: row.section_id }));
  }

  // --- Destinatarios de los avisos -----------------------------------------

  /** Docentes de la sección y administración activa. */
  async findStaffUserIds(sectionId) {
    const rows = await this.query(
      `SELECT DISTINCT c.teacher_id AS user_id FROM courses c
        WHERE c.school_id = ? AND c.section_id = ? AND c.is_active = 1 AND c.teacher_id IS NOT NULL
       UNION
       SELECT u.id FROM users u WHERE u.school_id = ? AND u.role = 'ADMIN' AND u.status = 'ACTIVE' AND u.deleted_at IS NULL`,
      [this.schoolId, sectionId, this.schoolId],
    );
    return rows.map((row) => row.user_id);
  }

  /** El estudiante (si tiene cuenta) y sus familias, de un estudiante o de toda una sección. */
  async findFamilyRecipients({ studentId, sectionId }) {
    const target = studentId
      ? 'st.id = ?'
      : `st.id IN (SELECT e.student_id FROM enrollments e WHERE e.school_id = st.school_id AND e.section_id = ? AND e.status = 'ACTIVE')`;
    const targetId = studentId ?? sectionId;
    const rows = await this.query(
      `SELECT st.id AS student_id, st.user_id AS user_id, 'STUDENT' AS kind
         FROM students st WHERE st.school_id = ? AND ${target} AND st.user_id IS NOT NULL
       UNION ALL
       SELECT st.id, gs.guardian_id, 'PARENT'
         FROM students st
         JOIN guardian_students gs ON gs.school_id = st.school_id AND gs.student_id = st.id AND gs.receives_notifications = 1
        WHERE st.school_id = ? AND ${target}`,
      [this.schoolId, targetId, this.schoolId, targetId],
    );
    return rows.map((row) => ({ studentId: row.student_id, userId: row.user_id, kind: row.kind }));
  }
}

export const messagesRepository = new MessagesRepository();
