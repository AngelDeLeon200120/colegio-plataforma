import { BaseRepository } from '../../core/db/BaseRepository.js';

const COURSE_COLUMNS = `
  c.id, c.teacher_id, c.section_id, sec.academic_year_id,
  sub.name AS subject_name, sub.color AS subject_color, gl.short_name AS grade_name, sec.name AS section_name`;

const COURSE_JOINS = `
  JOIN sections sec    ON sec.school_id = c.school_id AND sec.id = c.section_id
  JOIN subjects sub    ON sub.school_id = c.school_id AND sub.id = c.subject_id
  JOIN grade_levels gl ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id`;

const toCourse = (row) => ({
  id: row.id,
  name: `${row.grade_name} ${row.section_name} · ${row.subject_name}`,
  subject: row.subject_name,
  color: row.subject_color,
  teacherId: row.teacher_id,
  sectionId: row.section_id,
  academicYearId: row.academic_year_id,
});

class AcademicRepository extends BaseRepository {
  // `schools` es la tabla del tenant (su id ES el school_id): no pasa por el guard de query()
  async findSchoolTimezone() {
    const [rows] = await this.db.execute('SELECT timezone FROM schools WHERE id = ?', [this.schoolId]);
    return rows[0].timezone;
  }

  async findCourse(courseId) {
    const row = await this.one(
      `SELECT ${COURSE_COLUMNS} FROM courses c ${COURSE_JOINS}
        WHERE c.school_id = ? AND c.id = ? AND c.is_active = 1`,
      [this.schoolId, courseId],
    );
    return row && toCourse(row);
  }

  /** Cursos del ciclo activo. Con `teacherId`, solo los asignados a ese docente. */
  async listActiveCourses(teacherId = null) {
    const params = [this.schoolId];
    if (teacherId) params.push(teacherId);

    const rows = await this.query(
      `SELECT ${COURSE_COLUMNS},
              (SELECT COUNT(*) FROM enrollments e
                WHERE e.school_id = c.school_id AND e.section_id = c.section_id AND e.status = 'ACTIVE') AS student_count
         FROM courses c ${COURSE_JOINS}
         JOIN academic_years ay ON ay.school_id = sec.school_id AND ay.id = sec.academic_year_id AND ay.status = 'ACTIVE'
        WHERE c.school_id = ? AND c.is_active = 1 ${teacherId ? 'AND c.teacher_id = ?' : ''}
        ORDER BY gl.sort_order, sec.name, sub.name`,
      params,
    );
    return rows.map((row) => {
      const { teacherId: _teacher, ...course } = toCourse(row);
      return { ...course, studentCount: Number(row.student_count) };
    });
  }

  async findUnit(unitId) {
    const row = await this.one(
      `SELECT id, academic_year_id, sequence_no, name, status, starts_on, ends_on
         FROM academic_units WHERE school_id = ? AND id = ?`,
      [this.schoolId, unitId],
    );
    return row && { id: row.id, academicYearId: row.academic_year_id, sequence: row.sequence_no, name: row.name, status: row.status };
  }

  async listUnits(academicYearId) {
    const rows = await this.query(
      `SELECT id, sequence_no, name, status FROM academic_units
        WHERE school_id = ? AND academic_year_id = ?
        ORDER BY sequence_no`,
      [this.schoolId, academicYearId],
    );
    return rows.map((row) => ({ id: row.id, sequence: row.sequence_no, name: row.name, status: row.status }));
  }

  /** Alumnos con inscripción activa en la sección, ordenados como en la lista de clase. */
  async listSectionStudents(sectionId) {
    const rows = await this.query(
      `SELECT st.id, st.student_code, st.first_name, st.last_name
         FROM enrollments e
         JOIN students st ON st.school_id = e.school_id AND st.id = e.student_id
        WHERE e.school_id = ? AND e.section_id = ? AND e.status = 'ACTIVE'
        ORDER BY st.last_name, st.first_name`,
      [this.schoolId, sectionId],
    );
    return rows.map((row) => ({ id: row.id, code: row.student_code, firstName: row.first_name, lastName: row.last_name }));
  }
}

export const academicRepository = new AcademicRepository();
