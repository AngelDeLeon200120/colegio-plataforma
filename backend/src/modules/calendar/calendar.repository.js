import { BaseRepository } from '../../core/db/BaseRepository.js';
import { courseVisibility, sectionVisibility } from '../academic/academic.visibility.js';

const toEvent = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  category: row.category,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  allDay: Boolean(row.all_day),
  location: row.location,
  section: row.section_id ? { id: row.section_id, name: `${row.grade_name} ${row.section_name}` } : null,
  createdAt: row.created_at,
});

const EVENT_SELECT = `
  SELECT ev.id, ev.title, ev.description, ev.category, ev.starts_at, ev.ends_at, ev.all_day, ev.location, ev.section_id, ev.created_at,
         sec.name AS section_name, gl.short_name AS grade_name
    FROM calendar_events ev
    LEFT JOIN sections sec    ON sec.school_id = ev.school_id AND sec.id = ev.section_id
    LEFT JOIN grade_levels gl ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id`;

class CalendarRepository extends BaseRepository {
  /** Eventos que se cruzan con [from, to): para todo el colegio o para una sección que la persona ve. */
  async listEvents(user, { from, to }) {
    const visible = sectionVisibility(user, 'ev.section_id');
    const rows = await this.query(
      `${EVENT_SELECT}
        WHERE ev.school_id = ? AND ev.deleted_at IS NULL AND ev.starts_at < ? AND ev.ends_at >= ?
          AND (ev.section_id IS NULL OR ${visible.sql})
        ORDER BY ev.starts_at, ev.id
        LIMIT 1000`,
      [this.schoolId, to, from, ...visible.params],
    );
    return rows.map(toEvent);
  }

  async findEvent(eventId) {
    const row = await this.one(`${EVENT_SELECT} WHERE ev.school_id = ? AND ev.id = ? AND ev.deleted_at IS NULL`, [this.schoolId, eventId]);
    return row && toEvent(row);
  }

  /** Vencimientos de actividades publicadas que la persona ve (las de unidades futuras quedan fuera). */
  async listDueActivities(user, { from, to }) {
    const visible = courseVisibility(user);
    const rows = await this.query(
      `SELECT a.id, a.title, a.due_at, c.id AS course_id, sub.name AS subject_name, sub.color AS subject_color
         FROM activities a
         JOIN courses c        ON c.school_id = a.school_id AND c.id = a.course_id AND c.is_active = 1
         JOIN subjects sub     ON sub.school_id = c.school_id AND sub.id = c.subject_id
         JOIN academic_units u ON u.school_id = a.school_id AND u.id = a.academic_unit_id
        WHERE a.school_id = ? AND a.deleted_at IS NULL AND a.status IN ('PUBLISHED', 'CLOSED')
          AND (a.publish_at IS NULL OR a.publish_at <= UTC_TIMESTAMP())
          AND u.status IN ('ACTIVE', 'CLOSED')
          AND a.due_at >= ? AND a.due_at < ? AND ${visible.sql}
        ORDER BY a.due_at
        LIMIT 500`,
      [this.schoolId, from, to, ...visible.params],
    );
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      dueAt: row.due_at,
      course: { id: row.course_id, subject: row.subject_name, color: row.subject_color },
    }));
  }

  async listSections() {
    const rows = await this.query(
      `SELECT sec.id, sec.name, gl.short_name
         FROM sections sec
         JOIN grade_levels gl   ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
         JOIN academic_years ay ON ay.school_id = sec.school_id AND ay.id = sec.academic_year_id AND ay.status = 'ACTIVE'
        WHERE sec.school_id = ?
        ORDER BY gl.sort_order, sec.name`,
      [this.schoolId],
    );
    return rows.map((row) => ({ id: row.id, name: `${row.short_name} ${row.name}` }));
  }

  /**
   * A quién avisa un evento. Sin sección: toda la comunidad activa. Con sección: sus estudiantes,
   * sus familias (con el estudiante, para el selector de hijos), sus docentes y la administración.
   * Devuelve [{ userId, studentId? }].
   */
  async findEventAudience(sectionId) {
    const active = `u.school_id = ? AND u.status = 'ACTIVE' AND u.deleted_at IS NULL`;
    if (!sectionId) {
      const rows = await this.query(`SELECT u.id FROM users u WHERE ${active}`, [this.schoolId]);
      return rows.map((row) => ({ userId: row.id }));
    }
    const rows = await this.query(
      `SELECT u.id AS user_id, NULL AS student_id FROM users u
        WHERE ${active} AND (u.role = 'ADMIN'
           OR EXISTS (SELECT 1 FROM courses c WHERE c.school_id = u.school_id AND c.section_id = ? AND c.teacher_id = u.id AND c.is_active = 1)
           OR EXISTS (SELECT 1 FROM sections s WHERE s.school_id = u.school_id AND s.id = ? AND s.homeroom_teacher_id = u.id))
       UNION
       SELECT st.user_id, NULL FROM enrollments e
         JOIN students st ON st.school_id = e.school_id AND st.id = e.student_id AND st.user_id IS NOT NULL
         JOIN users u     ON u.id = st.user_id AND ${active}
        WHERE e.school_id = ? AND e.section_id = ? AND e.status = 'ACTIVE'
       UNION
       SELECT gs.guardian_id, gs.student_id FROM enrollments e
         JOIN guardian_students gs ON gs.school_id = e.school_id AND gs.student_id = e.student_id AND gs.receives_notifications = 1
         JOIN users u              ON u.id = gs.guardian_id AND ${active}
        WHERE e.school_id = ? AND e.section_id = ? AND e.status = 'ACTIVE'`,
      [this.schoolId, sectionId, sectionId, this.schoolId, this.schoolId, sectionId, this.schoolId, this.schoolId, sectionId],
    );
    return rows.map((row) => ({ userId: row.user_id, studentId: row.student_id ?? null }));
  }

  async sectionExists(sectionId) {
    return Boolean(await this.one('SELECT 1 AS found FROM sections WHERE school_id = ? AND id = ?', [this.schoolId, sectionId]));
  }

  async insertEvent(event) {
    const result = await this.query(
      `INSERT INTO calendar_events (school_id, title, description, category, starts_at, ends_at, all_day, location, section_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        this.schoolId,
        event.title,
        event.description ?? null,
        event.category,
        event.startsAt,
        event.endsAt,
        event.allDay ? 1 : 0,
        event.location ?? null,
        event.sectionId ?? null,
        event.createdBy,
      ],
    );
    return result.insertId;
  }

  async updateEvent(eventId, fields) {
    const columns = {
      title: 'title',
      description: 'description',
      category: 'category',
      startsAt: 'starts_at',
      endsAt: 'ends_at',
      allDay: 'all_day',
      location: 'location',
      sectionId: 'section_id',
    };
    const entries = Object.entries(fields).filter(([key, value]) => columns[key] && value !== undefined);
    if (!entries.length) return;
    await this.query(
      `UPDATE calendar_events SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')} WHERE school_id = ? AND id = ? AND deleted_at IS NULL`,
      [...entries.map(([key, value]) => (key === 'allDay' ? (value ? 1 : 0) : value)), this.schoolId, eventId],
    );
  }

  async softDeleteEvent(eventId) {
    await this.query('UPDATE calendar_events SET deleted_at = UTC_TIMESTAMP() WHERE school_id = ? AND id = ? AND deleted_at IS NULL', [
      this.schoolId,
      eventId,
    ]);
  }
}

export const calendarRepository = new CalendarRepository();
