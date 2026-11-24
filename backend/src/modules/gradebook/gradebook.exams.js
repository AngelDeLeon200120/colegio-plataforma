// Columnas fijas del cuadro de notas. Por defecto: Asistencia, Total, Parcial, Evaluación y Nota final.
// Asistencia cuenta dentro del Total; Nota final = Total + Parcial + Evaluación, sobre 100 puntos.

export const UNIT_POINTS = 100;

const ATTENDANCE = { kind: 'ATTENDANCE', name: 'Asistencia', maxScore: 10 };

export const EXAMS = [
  { kind: 'PARTIAL', name: 'Parcial', maxScore: 10 },
  { kind: 'EVALUATION', name: 'Evaluación', maxScore: 20 },
];

export const FIXED_COLUMNS = [ATTENDANCE, ...EXAMS];

/** Parcial o Evaluación: van después del Total. */
export const isExam = (item) => EXAMS.some((exam) => exam.kind === item.kind);

/** Columna fija: no se borra ni se renombra; solo cambian sus puntos y si se publica. */
export const isFixed = (item) => item.kind !== 'REGULAR';

/**
 * ¿La unidad usa Parcial y Evaluación? Las que se cerraron antes de existir estas columnas
 * conservan su cálculo anterior; una cerrada sin ellas tampoco las usa.
 */
export const usesExams = (unit, items) => items.some(isExam) || (unit.examColumns && unit.status !== 'CLOSED');

/** Puntos que puede llegar a tener el Total: los que no ocupan Parcial y Evaluación (70 por defecto). */
export function totalLimit(unit, items) {
  if (!usesExams(unit, items)) return null;
  const maxOf = (exam) => items.find((item) => item.kind === exam.kind)?.maxScore ?? exam.maxScore;
  return UNIT_POINTS - EXAMS.reduce((sum, exam) => sum + maxOf(exam), 0);
}
