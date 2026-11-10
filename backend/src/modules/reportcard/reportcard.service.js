import { AppError } from '../../core/errors/AppError.js';
import { BaseRepository } from '../../core/db/BaseRepository.js';
import { unpaidUnitsOf } from '../finance/finance.holds.js';
import { resolveStudent } from '../homework/homework.service.js';

// Nota mínima de aprobación sobre 100 (la misma que usa el cuadro de notas).
// Pendiente: leerla de schools.settings.
export const PASSING_SCORE = 60;

class ReportCardRepository extends BaseRepository {
  /** Sección del ciclo activo donde está inscrito el estudiante. */
  async findEnrollment(studentId) {
    const row = await this.one(
      `SELECT e.section_id, ay.id AS year_id, ay.name AS year_name, CONCAT(gl.short_name, ' ', sec.name) AS section_label
         FROM enrollments e
         JOIN academic_years ay ON ay.school_id = e.school_id AND ay.id = e.academic_year_id AND ay.status = 'ACTIVE'
         JOIN sections sec      ON sec.school_id = e.school_id AND sec.id = e.section_id
         JOIN grade_levels gl   ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
        WHERE e.school_id = ? AND e.student_id = ? AND e.status = 'ACTIVE'`,
      [this.schoolId, studentId],
    );
    return row && { sectionId: row.section_id, yearId: row.year_id, yearName: row.year_name, section: row.section_label };
  }

  /** Las unidades futuras no se muestran: solo la activa y las cerradas. */
  async listVisibleUnits(yearId) {
    const rows = await this.query(
      `SELECT id, name, status FROM academic_units
        WHERE school_id = ? AND academic_year_id = ? AND status IN ('ACTIVE', 'CLOSED')
        ORDER BY sequence_no`,
      [this.schoolId, yearId],
    );
    return rows.map((row) => ({ id: row.id, name: row.name, status: row.status }));
  }

  async listCourses(sectionId) {
    const rows = await this.query(
      `SELECT c.id, sub.name AS subject, sub.color, u.first_name, u.last_name
         FROM courses c
         JOIN subjects sub ON sub.school_id = c.school_id AND sub.id = c.subject_id
         JOIN users u      ON u.school_id = c.school_id AND u.id = c.teacher_id
        WHERE c.school_id = ? AND c.section_id = ? AND c.is_active = 1
        ORDER BY sub.name`,
      [this.schoolId, sectionId],
    );
    return rows.map((row) => ({ id: row.id, subject: row.subject, color: row.color, teacher: `${row.first_name} ${row.last_name}` }));
  }

  /** Solo columnas publicadas por el docente, con la nota del estudiante (si tiene). */
  async listPublishedItems(sectionId, studentId, unitIds) {
    if (!unitIds.length) return [];
    const rows = await this.query(
      `SELECT gi.id, gi.course_id, gi.academic_unit_id, gi.name, gi.max_score, gi.weight, gs.score, gs.is_excused
         FROM grade_items gi
         JOIN courses c ON c.school_id = gi.school_id AND c.id = gi.course_id AND c.section_id = ?
         LEFT JOIN grade_scores gs ON gs.school_id = gi.school_id AND gs.grade_item_id = gi.id AND gs.student_id = ?
        WHERE gi.school_id = ? AND gi.is_published = 1 AND gi.academic_unit_id IN (${unitIds.map(() => '?').join(', ')})
        ORDER BY gi.sort_order, gi.id`,
      [sectionId, studentId, this.schoolId, ...unitIds],
    );
    return rows.map((row) => ({
      id: row.id,
      courseId: row.course_id,
      unitId: row.academic_unit_id,
      name: row.name,
      maxScore: row.max_score,
      weight: row.weight,
      score: row.score ?? null,
      isExcused: Boolean(row.is_excused),
    }));
  }
}

const repo = new ReportCardRepository();

const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Resultado de una materia en una unidad, con dos lecturas:
 *  - total: zona acumulada sobre 100 (misma regla que el cuadro de notas: Σ nota/máx × peso)
 *  - percent: rendimiento sobre lo publicado (total ÷ pesos publicados × 100).
 * A mitad de unidad solo hay parte de los puntos publicados: 29 de 30 es un 97 %, no un 29 reprobado.
 * null si no hay columnas publicadas con peso.
 */
function result(items) {
  const weighted = items.filter((item) => item.weight > 0);
  if (!weighted.length) return { total: null, published: 0, percent: null };
  const total = weighted.reduce((sum, item) => (item.score === null ? sum : sum + (item.score / item.maxScore) * item.weight), 0);
  const published = weighted.reduce((sum, item) => sum + item.weight, 0);
  return { total: round1(total), published: round1(published), percent: round1((total / published) * 100) };
}

export const reportCardService = {
  async get(user, { studentId, unitId }) {
    const { student } = await resolveStudent(user, studentId);
    const enrollment = await repo.findEnrollment(student.id);
    if (!enrollment) throw AppError.unprocessable('NOT_ENROLLED', `${student.firstName} no está inscrito en el ciclo activo`);

    const units = await repo.listVisibleUnits(enrollment.yearId);
    if (!units.length) throw AppError.unprocessable('NO_UNITS', 'Todavía no hay unidades abiertas en el ciclo');
    const unit = unitId ? units.find((candidate) => candidate.id === unitId) : (units.find((u) => u.status === 'ACTIVE') ?? units.at(-1));
    if (!unit) throw AppError.notFound('Unidad no encontrada');

    const [courses, rawItems, withheld] = await Promise.all([
      repo.listCourses(enrollment.sectionId),
      repo.listPublishedItems(
        enrollment.sectionId,
        student.id,
        units.map((u) => u.id),
      ),
      unpaidUnitsOf(student.id, units.map((u) => u.id)),
    ]);

    // Unidad con pagos vencidos: las notas no salen del servidor; se ven como "Pendiente"
    const items = rawItems.map((item) => (withheld.has(item.unitId) ? { ...item, score: null, withheld: true } : item));
    const resultOf = (courseItems, forUnitId) =>
      withheld.has(forUnitId) ? { total: null, published: 0, percent: null, withheld: true } : result(courseItems);

    const itemsOf = (courseId, forUnitId) => items.filter((item) => item.courseId === courseId && item.unitId === forUnitId);

    const unitCourses = courses.map((course) => {
      const courseItems = itemsOf(course.id, unit.id);
      return { ...course, items: courseItems.map(({ courseId, unitId: _unit, ...item }) => item), ...resultOf(courseItems, unit.id) };
    });
    const graded = unitCourses.filter((course) => course.percent !== null);

    return {
      student: { ...student, section: enrollment.section },
      year: enrollment.yearName,
      passingScore: PASSING_SCORE,
      units: units.map((u) => ({ ...u, withheld: withheld.has(u.id) })),
      unit: { ...unit, withheld: withheld.has(unit.id) },
      courses: unitCourses,
      // Promedio de rendimiento entre las materias con notas publicadas
      average: graded.length ? round1(graded.reduce((sum, course) => sum + course.percent, 0) / graded.length) : null,
      // true cuando todas las materias calificadas tienen sus 100 puntos publicados
      complete: graded.length > 0 && graded.every((course) => course.published >= 100),
      // Resumen del ciclo: resultado de cada materia en cada unidad visible
      overview: courses.map((course) => ({
        courseId: course.id,
        subject: course.subject,
        color: course.color,
        units: Object.fromEntries(units.map((u) => [u.id, resultOf(itemsOf(course.id, u.id), u.id)])),
      })),
    };
  },
};
