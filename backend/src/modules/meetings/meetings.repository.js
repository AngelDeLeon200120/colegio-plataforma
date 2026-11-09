import { BaseRepository } from '../../core/db/BaseRepository.js';
import { courseVisibility } from '../academic/academic.visibility.js';

const MEETING_COLUMNS = `
  m.id, m.course_id, m.title, m.description, m.starts_at, m.duration_minutes, m.code, m.provider, m.external_url, m.status,
  m.created_at, c.teacher_id, c.section_id, sub.name AS subject_name, sub.color AS subject_color,
  gl.short_name AS grade_name, sec.name AS section_name, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name`;

const MEETING_JOINS = `
  FROM meetings m
  JOIN courses c       ON c.school_id = m.school_id AND c.id = m.course_id
  JOIN sections sec    ON sec.school_id = c.school_id AND sec.id = c.section_id
  JOIN subjects sub    ON sub.school_id = c.school_id AND sub.id = c.subject_id
  JOIN grade_levels gl ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
  JOIN users t         ON t.school_id = c.school_id AND t.id = c.teacher_id`;

const toMeeting = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  startsAt: row.starts_at,
  durationMinutes: row.duration_minutes,
  code: row.code,
  provider: row.provider,
  externalUrl: row.external_url,
  status: row.status,
  createdAt: row.created_at,
  teacherId: row.teacher_id,
  course: {
    id: row.course_id,
    name: `${row.grade_name} ${row.section_name} · ${row.subject_name}`,
    subject: row.subject_name,
    color: row.subject_color,
    sectionId: row.section_id,
    teacher: `${row.teacher_first_name} ${row.teacher_last_name}`,
  },
});

class MeetingsRepository extends BaseRepository {
  // `schools` es la tabla del tenant (su id ES el school_id): no pasa por el guard de query()
  async findSchoolSlug() {
    const [rows] = await this.db.execute('SELECT slug FROM schools WHERE id = ?', [this.schoolId]);
    return rows[0]?.slug ?? 'colegio';
  }

  /** Reuniones visibles para la persona, filtradas por curso y por rango de fechas (UTC). */
  async listVisible(user, { courseId, from, to, includeCancelled = true }) {
    const visible = courseVisibility(user);
    const filters = [];
    const params = [];
    if (courseId) {
      filters.push('AND m.course_id = ?');
      params.push(courseId);
    }
    if (from) {
      filters.push('AND DATE_ADD(m.starts_at, INTERVAL m.duration_minutes MINUTE) >= ?');
      params.push(from);
    }
    if (to) {
      filters.push('AND m.starts_at < ?');
      params.push(to);
    }
    if (!includeCancelled) filters.push("AND m.status = 'SCHEDULED'");

    const rows = await this.query(
      `SELECT ${MEETING_COLUMNS} ${MEETING_JOINS}
        WHERE m.school_id = ? AND c.is_active = 1 AND ${visible.sql} ${filters.join(' ')}
        ORDER BY m.starts_at, m.id
        LIMIT 500`,
      [this.schoolId, ...visible.params, ...params],
    );
    return rows.map(toMeeting);
  }

  async findVisible(user, meetingId) {
    const visible = courseVisibility(user);
    const row = await this.one(`SELECT ${MEETING_COLUMNS} ${MEETING_JOINS} WHERE m.school_id = ? AND m.id = ? AND ${visible.sql}`, [
      this.schoolId,
      meetingId,
      ...visible.params,
    ]);
    return row && toMeeting(row);
  }

  async findVisibleByCode(user, code) {
    const visible = courseVisibility(user);
    const row = await this.one(`SELECT ${MEETING_COLUMNS} ${MEETING_JOINS} WHERE m.school_id = ? AND m.code = ? AND ${visible.sql}`, [
      this.schoolId,
      code,
      ...visible.params,
    ]);
    return row && toMeeting(row);
  }

  async codeExists(code) {
    return Boolean(await this.one('SELECT 1 AS found FROM meetings WHERE school_id = ? AND code = ?', [this.schoolId, code]));
  }

  async insert(meeting) {
    const result = await this.query(
      `INSERT INTO meetings (school_id, course_id, title, description, starts_at, duration_minutes, code, provider, external_url, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        this.schoolId,
        meeting.courseId,
        meeting.title,
        meeting.description ?? null,
        meeting.startsAt,
        meeting.durationMinutes,
        meeting.code,
        meeting.provider,
        meeting.provider === 'EXTERNAL' ? meeting.externalUrl : null,
        meeting.createdBy,
      ],
    );
    return result.insertId;
  }

  async update(meetingId, fields) {
    const columns = { title: 'title', description: 'description', startsAt: 'starts_at', durationMinutes: 'duration_minutes', provider: 'provider', externalUrl: 'external_url' };
    const entries = Object.entries(fields).filter(([key, value]) => columns[key] && value !== undefined);
    if (!entries.length) return;
    await this.query(`UPDATE meetings SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')} WHERE school_id = ? AND id = ?`, [
      ...entries.map(([, value]) => value),
      this.schoolId,
      meetingId,
    ]);
  }

  async setStatus(meetingId, status) {
    await this.query('UPDATE meetings SET status = ? WHERE school_id = ? AND id = ?', [status, this.schoolId, meetingId]);
  }
}

export const meetingsRepository = new MeetingsRepository();
