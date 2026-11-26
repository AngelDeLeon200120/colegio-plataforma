import { BaseRepository } from '../../core/db/BaseRepository.js';
import { classDaysFrom } from './attendance.rules.js';

class AttendanceRepository extends BaseRepository {
  /** Unidad activa del ciclo del curso, con su fecha de inicio. */
  async findActiveUnit(academicYearId) {
    const row = await this.one(
      `SELECT id, name, status, exam_columns, DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on
         FROM academic_units
        WHERE school_id = ? AND academic_year_id = ? AND status = 'ACTIVE'`,
      [this.schoolId, academicYearId],
    );
    return row && { id: row.id, name: row.name, status: row.status, examColumns: Boolean(row.exam_columns), startsOn: row.starts_on };
  }

  /** Días de clase del colegio (de schools.settings; por defecto, de lunes a viernes). */
  async findClassDays() {
    // `schools` es la tabla del tenant (su id ES el school_id): no pasa por el guard de query()
    const [rows] = await this.db.execute('SELECT settings FROM schools WHERE id = ?', [this.schoolId]);
    const settings = rows[0]?.settings;
    return classDaysFrom(typeof settings === 'string' ? JSON.parse(settings) : settings);
  }

  /** Guarda los días de clase sin tocar el resto de la configuración del colegio. */
  async saveClassDays(classDays) {
    await this.db.execute("UPDATE schools SET settings = JSON_SET(COALESCE(settings, JSON_OBJECT()), '$.classDays', CAST(? AS JSON)) WHERE id = ?", [
      JSON.stringify(classDays),
      this.schoolId,
    ]);
  }

  /** Todas las marcas de la unidad, día por día. */
  async listUnit(courseId, unitId) {
    const rows = await this.query(
      `SELECT DATE_FORMAT(attended_on, '%Y-%m-%d') AS day, student_id, status, note
         FROM attendance_records
        WHERE school_id = ? AND course_id = ? AND academic_unit_id = ?
        ORDER BY attended_on`,
      [this.schoolId, courseId, unitId],
    );
    return rows.map((row) => ({ date: row.day, studentId: row.student_id, status: row.status, note: row.note }));
  }

  async listDayStudentIds(courseId, unitId, date) {
    const rows = await this.query(
      'SELECT student_id FROM attendance_records WHERE school_id = ? AND course_id = ? AND academic_unit_id = ? AND attended_on = ?',
      [this.schoolId, courseId, unitId, date],
    );
    return rows.map((row) => row.student_id);
  }

  /** Resumen por estudiante en la unidad: Map(studentId → { present, absent, excused }). */
  async summaries(courseId, unitId) {
    const rows = await this.query(
      `SELECT student_id, SUM(status = 'PRESENT') AS present, SUM(status = 'ABSENT') AS absent, SUM(status = 'EXCUSED') AS excused
         FROM attendance_records
        WHERE school_id = ? AND course_id = ? AND academic_unit_id = ?
        GROUP BY student_id`,
      [this.schoolId, courseId, unitId],
    );
    return new Map(rows.map((row) => [row.student_id, { present: Number(row.present), absent: Number(row.absent), excused: Number(row.excused) }]));
  }

  async upsertDay({ courseId, unitId, date, entries, markedBy }) {
    await this.query(
      `INSERT INTO attendance_records (school_id, course_id, academic_unit_id, student_id, attended_on, status, note, marked_by)
       VALUES ${entries.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')} AS incoming
       ON DUPLICATE KEY UPDATE status = incoming.status, note = incoming.note, marked_by = incoming.marked_by`,
      entries.flatMap(({ studentId, status, note }) => [this.schoolId, courseId, unitId, studentId, date, status, note ?? null, markedBy]),
    );
  }

  /** Deja vacías las celdas de esos estudiantes en ese día. */
  async clearEntries(courseId, unitId, date, studentIds) {
    if (!studentIds.length) return;
    await this.query(
      `DELETE FROM attendance_records
        WHERE school_id = ? AND course_id = ? AND academic_unit_id = ? AND attended_on = ? AND student_id IN (${studentIds.map(() => '?').join(', ')})`,
      [this.schoolId, courseId, unitId, date, ...studentIds],
    );
  }

  async deleteDay(courseId, unitId, date) {
    const result = await this.query(
      'DELETE FROM attendance_records WHERE school_id = ? AND course_id = ? AND academic_unit_id = ? AND attended_on = ?',
      [this.schoolId, courseId, unitId, date],
    );
    return result.affectedRows;
  }
}

export const attendanceRepository = new AttendanceRepository();
