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
import { GOOD_ATTENDANCE } from './attendance.rules.js';
import { syncAttendanceScores } from './attendance.sync.js';

async function loadContext(user, courseId) {
  const course = await academicRepository.findCourse(courseId);
  if (!course) throw AppError.notFound('Curso no encontrado');
  assertCourseStaff(user, course.teacherId, 'Solo el docente del curso puede pasar su asistencia');
  const unit = await attendanceRepository.findActiveUnit(course.academicYearId);
  if (!unit) throw AppError.unprocessable('NO_ACTIVE_UNIT', 'No hay una unidad activa: la asistencia se pasa durante la unidad');
  return { course, unit, today: await schoolTodayDate() };
}

function assertDate(date, unit, today) {
  if (date > today) throw AppError.unprocessable('FUTURE_DATE', 'No se puede pasar asistencia de un día que aún no llega');
  if (date < unit.startsOn) throw AppError.unprocessable('DATE_OUT_OF_UNIT', `La ${unit.name} empezó después de esa fecha`);
}

const emitColumns = (course, unit, user) =>
  emitToRoom(rooms.courseStaff(course.id), 'gradebook:items_changed', { courseId: course.id, unitId: unit.id, updatedBy: user.id });

/** Hoja completa de la unidad: estudiantes × días, como una hoja de cálculo. */
async function buildSheet({ course, unit, today }) {
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
  for (const { date, studentId, status } of records) (days[date] ??= {})[studentId] = status;

  return {
    course: { id: course.id, name: course.name },
    unit: { id: unit.id, name: unit.name, startsOn: unit.startsOn },
    today,
    goodAttendance: GOOD_ATTENDANCE,
    maxScore,
    students,
    days,
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
    const { course, unit, today } = context;
    for (const { date } of days) assertDate(date, unit, today);

    const students = await academicRepository.listSectionStudents(course.sectionId);
    const enrolled = new Set(students.map((student) => student.id));
    if (days.some((day) => day.entries.some((entry) => !enrolled.has(entry.studentId)))) {
      throw AppError.unprocessable('STUDENT_NOT_IN_SECTION', 'Hay un estudiante que ya no está en la sección. Recarga la lista.');
    }

    await withTransaction(async (connection, afterCommit) => {
      const repo = attendanceRepository.withConnection(connection);
      for (const { date, entries } of days) await repo.upsertDay({ courseId: course.id, unitId: unit.id, date, entries, markedBy: user.id });
      if (await syncAttendanceScores(connection, { course, unit, students, userId: user.id })) afterCommit(() => emitColumns(course, unit, user));
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
