import { BaseRepository } from '../core/db/BaseRepository.js';

export const REMINDER_BATCH_SIZE = 200;

const REMINDER_COLUMNS = `
  s.id, s.status, s.student_id, s.reminder_count, s.last_feedback,
  a.id AS activity_id, a.title, a.due_at, a.allow_late, a.status AS activity_status,
  a.publish_at, a.deleted_at, u.status AS unit_status,
  st.user_id AS student_user_id, st.first_name, st.status AS student_status`;

const REMINDER_JOINS = `
  FROM submissions s
  JOIN activities a     ON a.school_id = s.school_id AND a.id = s.activity_id
  JOIN academic_units u ON u.school_id = a.school_id AND u.id = a.academic_unit_id
  JOIN students st      ON st.school_id = s.school_id AND st.id = s.student_id`;

const toReminder = (row) => ({
  submissionId: row.id,
  status: row.status,
  reminderCount: row.reminder_count,
  lastFeedback: row.last_feedback,
  activity: {
    id: row.activity_id,
    title: row.title,
    dueAt: row.due_at,
    allowLate: Boolean(row.allow_late),
    // Ya no tiene sentido recordar: cerrada, archivada, borrada o de una unidad cerrada
    isOver: row.activity_status !== 'PUBLISHED' || Boolean(row.deleted_at) || row.unit_status === 'CLOSED',
    publishAt: row.publish_at,
  },
  student: { id: row.student_id, userId: row.student_user_id, firstName: row.first_name, active: row.student_status === 'ACTIVE' },
});

class RemindersRepository extends BaseRepository {
  /** Entregas pendientes o rechazadas cuyo recordatorio ya toca (índice ix_submissions_reminders). */
  async findDue() {
    const rows = await this.query(
      `SELECT ${REMINDER_COLUMNS} ${REMINDER_JOINS}
        WHERE s.school_id = ? AND s.status IN ('PENDING', 'REJECTED') AND s.next_reminder_at <= UTC_TIMESTAMP()
        ORDER BY s.next_reminder_at
        LIMIT ${REMINDER_BATCH_SIZE}`,
      [this.schoolId],
    );
    return rows.map(toReminder);
  }

  /**
   * Reprograma solo si la entrega sigue pendiente o rechazada: si el estudiante
   * entregó mientras corría el job, no se notifica (affectedRows = 0).
   */
  async reschedule(submissionId, { nextReminderAt, reminderCount }) {
    const result = await this.query(
      `UPDATE submissions
          SET next_reminder_at = ?, reminder_count = ?, last_reminded_at = UTC_TIMESTAMP()
        WHERE school_id = ? AND id = ? AND status IN ('PENDING', 'REJECTED')`,
      [nextReminderAt, reminderCount, this.schoolId, submissionId],
    );
    return result.affectedRows === 1;
  }

  async stopReminders(submissionId) {
    await this.query(`UPDATE submissions SET next_reminder_at = NULL WHERE school_id = ? AND id = ?`, [this.schoolId, submissionId]);
  }

  /** Pendientes cuya actividad vence en las próximas 24 h. */
  async findDueSoon() {
    const rows = await this.query(
      `SELECT ${REMINDER_COLUMNS} ${REMINDER_JOINS}
        WHERE s.school_id = ? AND s.status = 'PENDING'
          AND a.status = 'PUBLISHED' AND a.deleted_at IS NULL AND u.status = 'ACTIVE'
          AND (a.publish_at IS NULL OR a.publish_at <= UTC_TIMESTAMP())
          AND a.due_at > UTC_TIMESTAMP() AND a.due_at <= UTC_TIMESTAMP() + INTERVAL 1 DAY
          AND st.status = 'ACTIVE' AND st.user_id IS NOT NULL`,
      [this.schoolId],
    );
    return rows.map(toReminder);
  }

  async findGuardians(studentId) {
    const rows = await this.query(
      `SELECT guardian_id FROM guardian_students WHERE school_id = ? AND student_id = ? AND receives_notifications = 1`,
      [this.schoolId, studentId],
    );
    return rows.map((row) => row.guardian_id);
  }

  // --- Unidades -----------------------------------------------------------

  /** Ciclo activo con su unidad activa (si hay) y la siguiente programada que ya debió empezar. */
  async findUnitToActivate(localDate) {
    const row = await this.one(
      `SELECT ay.id AS year_id,
              (SELECT id FROM academic_units WHERE school_id = ay.school_id AND academic_year_id = ay.id AND status = 'ACTIVE') AS active_id,
              (SELECT id FROM academic_units
                WHERE school_id = ay.school_id AND academic_year_id = ay.id AND status = 'SCHEDULED' AND starts_on <= ?
                ORDER BY sequence_no LIMIT 1) AS next_id
         FROM academic_years ay
        WHERE ay.school_id = ? AND ay.status = 'ACTIVE'`,
      [localDate, this.schoolId],
    );
    return row && { yearId: row.year_id, activeId: row.active_id, nextId: row.next_id };
  }

  async activateUnit(unitId) {
    const result = await this.query(
      `UPDATE academic_units SET status = 'ACTIVE', activated_at = UTC_TIMESTAMP()
        WHERE school_id = ? AND id = ? AND status = 'SCHEDULED'`,
      [this.schoolId, unitId],
    );
    return result.affectedRows === 1;
  }

  async findUnitName(unitId) {
    const row = await this.one('SELECT name FROM academic_units WHERE school_id = ? AND id = ?', [this.schoolId, unitId]);
    return row?.name;
  }
}

export const remindersRepository = new RemindersRepository();
