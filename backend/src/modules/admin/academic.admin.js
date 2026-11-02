import { AppError } from '../../core/errors/AppError.js';
import { BaseRepository } from '../../core/db/BaseRepository.js';
import { emitToRoom } from '../../realtime/emitter.js';
import { rooms } from '../../realtime/rooms.js';

// Estructura del ciclo activo: unidades, grados, secciones, materias y cursos.

class AcademicAdminRepository extends BaseRepository {
  async activeYear() {
    const row = await this.one(
      `SELECT id, name, starts_on, ends_on, status FROM academic_years WHERE school_id = ? AND status = 'ACTIVE'`,
      [this.schoolId],
    );
    return row && { id: row.id, name: row.name, startsOn: row.starts_on, endsOn: row.ends_on, status: row.status };
  }

  async overview(yearId) {
    const [units, gradeLevels, sections, subjects, courses, teachers] = await Promise.all([
      this.query(
        `SELECT id, sequence_no, name, starts_on, ends_on, status, closed_at FROM academic_units
          WHERE school_id = ? AND academic_year_id = ? ORDER BY sequence_no`,
        [this.schoolId, yearId],
      ),
      this.query('SELECT id, name, short_name, education_level, sort_order FROM grade_levels WHERE school_id = ? ORDER BY sort_order, name', [
        this.schoolId,
      ]),
      this.query(
        `SELECT sec.id, sec.grade_level_id, sec.name, sec.homeroom_teacher_id, gl.short_name,
                (SELECT COUNT(*) FROM enrollments e WHERE e.school_id = sec.school_id AND e.section_id = sec.id AND e.status = 'ACTIVE') AS students
           FROM sections sec
           JOIN grade_levels gl ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
          WHERE sec.school_id = ? AND sec.academic_year_id = ?
          ORDER BY gl.sort_order, sec.name`,
        [this.schoolId, yearId],
      ),
      this.query('SELECT id, code, name, color, is_active FROM subjects WHERE school_id = ? ORDER BY name', [this.schoolId]),
      this.query(
        `SELECT c.id, c.section_id, c.subject_id, c.teacher_id, c.is_active
           FROM courses c
           JOIN sections sec ON sec.school_id = c.school_id AND sec.id = c.section_id AND sec.academic_year_id = ?
          WHERE c.school_id = ?`,
        [yearId, this.schoolId],
      ),
      this.query(
        `SELECT id, first_name, last_name FROM users WHERE school_id = ? AND role = 'TEACHER' AND status = 'ACTIVE' AND deleted_at IS NULL
          ORDER BY last_name, first_name`,
        [this.schoolId],
      ),
    ]);

    const teacherName = new Map(teachers.map((t) => [t.id, `${t.first_name} ${t.last_name}`]));
    const sectionLabel = new Map(sections.map((s) => [s.id, `${s.short_name} ${s.name}`]));
    const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

    return {
      units: units.map((u) => ({ id: u.id, sequence: u.sequence_no, name: u.name, startsOn: u.starts_on, endsOn: u.ends_on, status: u.status, closedAt: u.closed_at })),
      gradeLevels: gradeLevels.map((g) => ({ id: g.id, name: g.name, shortName: g.short_name, educationLevel: g.education_level })),
      sections: sections.map((s) => ({
        id: s.id,
        gradeLevelId: s.grade_level_id,
        name: s.name,
        label: sectionLabel.get(s.id),
        homeroomTeacherId: s.homeroom_teacher_id,
        homeroomTeacher: teacherName.get(s.homeroom_teacher_id) ?? null,
        studentCount: Number(s.students),
      })),
      subjects: subjects.map((s) => ({ id: s.id, code: s.code, name: s.name, color: s.color, isActive: Boolean(s.is_active) })),
      courses: courses
        .map((c) => ({
          id: c.id,
          sectionId: c.section_id,
          subjectId: c.subject_id,
          teacherId: c.teacher_id,
          label: `${sectionLabel.get(c.section_id)} · ${subjectName.get(c.subject_id)}`,
          teacher: teacherName.get(c.teacher_id) ?? '(docente inactivo)',
          isActive: Boolean(c.is_active),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      teachers: teachers.map((t) => ({ id: t.id, name: `${t.first_name} ${t.last_name}` })),
    };
  }

  async insertUnit(yearId, { name, startsOn, endsOn }) {
    const result = await this.query(
      `INSERT INTO academic_units (school_id, academic_year_id, sequence_no, name, starts_on, ends_on)
       SELECT ?, ?, COALESCE(MAX(sequence_no), 0) + 1, ?, ?, ?
         FROM academic_units WHERE school_id = ? AND academic_year_id = ?`,
      [this.schoolId, yearId, name, startsOn, endsOn, this.schoolId, yearId],
    );
    return result.insertId;
  }

  async findUnit(unitId) {
    const row = await this.one('SELECT id, name, status, academic_year_id FROM academic_units WHERE school_id = ? AND id = ?', [this.schoolId, unitId]);
    return row && { id: row.id, name: row.name, status: row.status, yearId: row.academic_year_id };
  }

  async setUnitStatus(unitId, from, to, adminId) {
    const result = await this.query(
      `UPDATE academic_units
          SET status = ?,
              activated_at = IF(? = 'ACTIVE', UTC_TIMESTAMP(), activated_at),
              closed_at = IF(? = 'CLOSED', UTC_TIMESTAMP(), NULL),
              closed_by = IF(? = 'CLOSED', ?, NULL)
        WHERE school_id = ? AND id = ? AND status = ?`,
      [to, to, to, to, adminId, this.schoolId, unitId, from],
    );
    return result.affectedRows === 1;
  }

  async insertGradeLevel({ name, shortName, educationLevel }) {
    const result = await this.query(
      `INSERT INTO grade_levels (school_id, name, short_name, education_level, sort_order)
       SELECT ?, ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1 FROM grade_levels WHERE school_id = ?`,
      [this.schoolId, name, shortName, educationLevel ?? null, this.schoolId],
    );
    return result.insertId;
  }

  async insertSection(yearId, { gradeLevelId, name, homeroomTeacherId }) {
    const result = await this.query(
      'INSERT INTO sections (school_id, academic_year_id, grade_level_id, name, homeroom_teacher_id) VALUES (?, ?, ?, ?, ?)',
      [this.schoolId, yearId, gradeLevelId, name, homeroomTeacherId ?? null],
    );
    return result.insertId;
  }

  async insertSubject({ code, name, color }) {
    const result = await this.query('INSERT INTO subjects (school_id, code, name, color) VALUES (?, ?, ?, ?)', [this.schoolId, code, name, color ?? null]);
    return result.insertId;
  }

  async isActiveTeacher(userId) {
    const row = await this.one(`SELECT id FROM users WHERE school_id = ? AND id = ? AND role = 'TEACHER' AND status = 'ACTIVE'`, [this.schoolId, userId]);
    return Boolean(row);
  }

  async insertCourse({ sectionId, subjectId, teacherId }) {
    const result = await this.query('INSERT INTO courses (school_id, section_id, subject_id, teacher_id) VALUES (?, ?, ?, ?)', [
      this.schoolId,
      sectionId,
      subjectId,
      teacherId,
    ]);
    return result.insertId;
  }

  async updateCourse(courseId, { teacherId, isActive }) {
    const result = await this.query(
      'UPDATE courses SET teacher_id = COALESCE(?, teacher_id), is_active = COALESCE(?, is_active) WHERE school_id = ? AND id = ?',
      [teacherId ?? null, isActive ?? null, this.schoolId, courseId],
    );
    return result.affectedRows === 1;
  }
}

const repo = new AcademicAdminRepository();

async function requireYear() {
  const year = await repo.activeYear();
  if (!year) throw AppError.unprocessable('NO_ACTIVE_YEAR', 'No hay un ciclo lectivo activo');
  return year;
}

/** Duplicados con un mensaje que la administración entienda. */
async function friendly(work, messages) {
  try {
    return await work();
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      const match = Object.entries(messages).find(([index]) => String(err.sqlMessage).includes(index));
      if (match) throw AppError.conflict('DUPLICATE', match[1]);
    }
    throw err;
  }
}

async function assertTeacher(teacherId) {
  if (teacherId && !(await repo.isActiveTeacher(teacherId))) throw AppError.notFound('Docente no encontrado o inactivo');
}

export const academicAdminService = {
  async overview() {
    const year = await repo.activeYear();
    if (!year) return { year: null, units: [], gradeLevels: [], sections: [], subjects: [], courses: [], teachers: [] };
    return { year, ...(await repo.overview(year.id)) };
  },

  async createUnit(data) {
    const year = await requireYear();
    if (data.endsOn <= data.startsOn) throw AppError.validation([{ field: 'endsOn', issue: 'Debe ser posterior al inicio' }]);
    await repo.insertUnit(year.id, data);
    return this.overview();
  },

  /**
   * activate: SCHEDULED → ACTIVE · close: ACTIVE → CLOSED · reopen: CLOSED → ACTIVE.
   * Solo una unidad activa por ciclo (índice único): primero se cierra la actual.
   */
  async changeUnitStatus(admin, unitId, action) {
    const unit = await repo.findUnit(unitId);
    if (!unit) throw AppError.notFound('Unidad no encontrada');
    const [from, to] = { activate: ['SCHEDULED', 'ACTIVE'], close: ['ACTIVE', 'CLOSED'], reopen: ['CLOSED', 'ACTIVE'] }[action];

    let changed;
    try {
      changed = await repo.setUnitStatus(unitId, from, to, admin.id);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw AppError.conflict('UNIT_ALREADY_ACTIVE', 'Ya hay una unidad activa en el ciclo: ciérrala primero');
      throw err;
    }
    if (!changed) throw AppError.unprocessable('INVALID_TRANSITION', `${unit.name} no está en un estado que permita esta acción`);

    emitToRoom(rooms.school(admin.schoolId), 'unit:status_changed', { unitId, status: to });
    return this.overview();
  },

  async createGradeLevel(data) {
    await friendly(() => repo.insertGradeLevel(data), { uq_grade_levels_name: 'Ya existe un grado con ese nombre' });
    return this.overview();
  },

  async createSection(data) {
    const year = await requireYear();
    await assertTeacher(data.homeroomTeacherId);
    await friendly(() => repo.insertSection(year.id, data), { uq_sections_name: 'Ese grado ya tiene una sección con ese nombre' });
    return this.overview();
  },

  async createSubject(data) {
    await friendly(() => repo.insertSubject(data), { uq_subjects_code: 'Ya existe una materia con ese código' });
    return this.overview();
  },

  async createCourse(data) {
    await assertTeacher(data.teacherId);
    await friendly(() => repo.insertCourse(data), { uq_courses_section_subject: 'Esa sección ya tiene esa materia asignada' });
    return this.overview();
  },

  async updateCourse(courseId, data) {
    await assertTeacher(data.teacherId);
    if (!(await repo.updateCourse(courseId, data))) throw AppError.notFound('Curso no encontrado');
    return this.overview();
  },
};
