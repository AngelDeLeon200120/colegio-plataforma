import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { emitToRoom } from '../../realtime/emitter.js';
import { rooms } from '../../realtime/rooms.js';
import { assertCourseStaff } from '../academic/academic.access.js';
import { academicRepository } from '../academic/academic.repository.js';
import { schoolTodayDate } from '../finance/finance.holds.js';
import { FIXED_COLUMNS } from '../gradebook/gradebook.exams.js';
import { gradebookRepository } from '../gradebook/gradebook.repository.js';
import { attendanceRepository } from './attendance.repository.js';
import { GOOD_ATTENDANCE, weekdayOf } from './attendance.rules.js';
import { syncAttendanceScores } from './attendance.sync.js';

async function loadContext(user, courseId) {
  const course = await academicRepository.findCourse(courseId);
  if (!course) throw AppError.notFound('Curso no encontrado');
  assertCourseStaff(user, course.teacherId, 'Solo el docente del curso puede pasar su asistencia');
  const unit = await attendanceRepository.findActiveUnit(course.academicYearId);
  if (!unit) throw AppError.unprocessable('NO_ACTIVE_UNIT', 'No hay una unidad activa: la asistencia se pasa durante la unidad');
  const [today, classDays] = await Promise.all([schoolTodayDate(), attendanceRepository.findClassDays()]);
  return { course, unit, today, classDays };
}

function assertDate(date, { unit, today, classDays }) {
  if (date > today) throw AppError.unprocessable('FUTURE_DATE', 'No se puede pasar asistencia de un día que aún no llega');
  if (date < unit.startsOn) throw AppError.unprocessable('DATE_OUT_OF_UNIT', `La ${unit.name} empezó después de esa fecha`);
  if (!classDays.includes(weekdayOf(date))) throw AppError.unprocessable('NOT_A_CLASS_DAY', 'Ese día no hay clases');
}

const emitColumns = (course, unit, user) =>
  emitToRoom(rooms.courseStaff(course.id), 'gradebook:items_changed', { courseId: course.id, unitId: unit.id, updatedBy: user.id });

/** Hoja completa de la unidad: estudiantes × días, como una hoja de cálculo. */
async function buildSheet({ course, unit, today, classDays }) {
  const [students, records, items, scores] = await Promise.all([
    academicRepository.listSectionStudents(course.sectionId),
    attendanceRepository.listUnit(course.id, unit.id),
    gradebookRepository.listItems(course.id, unit.id),
    gradebookRepository.listScores(course.id, unit.id),
  ]);
  const column = items.find((item) => item.kind === 'ATTENDANCE');
  const maxScore = (column ?? FIXED_COLUMNS.find((candidate) => candidate.kind === 'ATTENDANCE')).maxScore;
  // Cambiadas con "Mejora" en el cuadro: se respetan y se muestran tal cual
  const adjusted = Object.fromEntries(
    scores.filter((score) => score.improved && score.gradeItemId === column?.id).map((score) => [score.studentId, score.score]),
  );

  const days = {}; // fecha → { studentId: status }
  const notes = {}; // fecha → { studentId: nota }
  for (const { date, studentId, status, note } of records) {
    (days[date] ??= {})[studentId] = status;
    if (note) (notes[date] ??= {})[studentId] = note;
  }

  return {
    course: { id: course.id, name: course.name },
    unit: { id: unit.id, name: unit.name, startsOn: unit.startsOn },
    today,
    classDays,
    goodAttendance: GOOD_ATTENDANCE,
    maxScore,
    students,
    days,
    notes,
    adjusted,
  };
}

export const attendanceService = {
  async getSheet(user, courseId) {
    return buildSheet(await loadContext(user, courseId));
  },

  /** Guarda uno o varios días a la vez; todo o nada. */
  async save(user, courseId, { days }) {
    const context = await loadContext(user, courseId);
    const { course, unit } = context;
    for (const { date } of days) assertDate(date, context);

    const students = await academicRepository.listSectionStudents(course.sectionId);
    const enrolled = new Set(students.map((student) => student.id));
    if (days.some((day) => day.entries.some((entry) => !enrolled.has(entry.studentId)))) {
      throw AppError.unprocessable('STUDENT_NOT_IN_SECTION', 'Hay un estudiante que ya no está en la sección. Recarga la lista.');
    }

    await withTransaction(async (connection, afterCommit) => {
      const repo = attendanceRepository.withConnection(connection);
      const clearedIds = new Set();
      for (const { date, entries } of days) {
        // Celdas vacías: se quita la marca; si el estudiante se queda sin días, su nota se vacía
        const cleared = entries.filter((entry) => entry.status === null).map((entry) => entry.studentId);
        const marked = entries.filter((entry) => entry.status !== null);
        await repo.clearEntries(course.id, unit.id, date, cleared);
        if (marked.length) await repo.upsertDay({ courseId: course.id, unitId: unit.id, date, entries: marked, markedBy: user.id });
        cleared.forEach((studentId) => clearedIds.add(studentId));
      }
      if (await syncAttendanceScores(connection, { course, unit, students, userId: user.id, clearedIds: [...clearedIds] })) {
        afterCommit(() => emitColumns(course, unit, user));
      }
    });
    return buildSheet(context);
  },

  /** Quita la lista de un día (se pasó por error, fue asueto…) y recalcula la nota. */
  async removeDay(user, courseId, { date }) {
    const context = await loadContext(user, courseId);
    const { course, unit } = context;
    const students = await academicRepository.listSectionStudents(course.sectionId);

    await withTransaction(async (connection, afterCommit) => {
      const repo = attendanceRepository.withConnection(connection);
      const clearedIds = await repo.listDayStudentIds(course.id, unit.id, date);
      if (!(await repo.deleteDay(course.id, unit.id, date))) throw AppError.notFound('Ese día no tiene asistencia registrada');
      if (await syncAttendanceScores(connection, { course, unit, students, userId: user.id, clearedIds })) afterCommit(() => emitColumns(course, unit, user));
    });
    return buildSheet(context);
  },
};
