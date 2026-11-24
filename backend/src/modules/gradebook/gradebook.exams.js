// Parcial, Evaluación y Nota final: columnas fijas al final del cuadro, después del Total.
// Nota final = Total (actividades) + Parcial + Evaluación, sobre 100 puntos.

export const UNIT_POINTS = 100;

export const EXAMS = [
  { kind: 'PARTIAL', name: 'Parcial', maxScore: 10 },
  { kind: 'EVALUATION', name: 'Evaluación', maxScore: 20 },
];

export const isExam = (item) => item.kind !== 'REGULAR';

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
