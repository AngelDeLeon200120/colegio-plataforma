// Datos en memoria equivalentes a database/seeds/dev-seed.sql.
// Reproducen las mismas reglas que la API (versión, transiciones, nota máxima).
import { ApiError } from '@/lib/apiClient';

const LATENCY_MS = 300;
const wait = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
const clone = (value) => structuredClone(value);

const activity = {
  id: 1,
  title: 'Guía de fracciones equivalentes',
  dueAt: '2026-10-31T05:59:00.000Z',
  maxScore: 20,
  status: 'PUBLISHED',
  courseId: 1,
  courseName: '3ro B · Matemáticas',
};

const teacher = { name: 'Lucía Méndez' };
const student = (id, code, firstName, lastName) => ({ id, code, firstName, lastName });
const file = (id, name, mimeType, size) => ({ id, name, mimeType, size });

const submissions = [
  {
    id: 1, status: 'SUBMITTED', score: null, version: 3, isLate: true, attemptCount: 2,
    lastSubmittedAt: '2026-11-01T22:14:00.000Z', reviewedAt: '2026-10-31T15:20:00.000Z',
    lastFeedback: 'Falta el procedimiento en los ejercicios 3 y 4. Recuerda simplificar hasta la mínima expresión.',
    student: student(1, 'A001', 'Ana', 'López'),
    attempts: [
      { id: 1, number: 1, comment: null, isLate: false, submittedAt: '2026-10-30T20:05:00.000Z', files: [file(1, 'fracciones_ana.pdf', 'application/pdf', 284311)] },
      {
        id: 2, number: 2, comment: 'Profe, ya agregué el procedimiento del 3 y 4 en hojas aparte.', isLate: true,
        submittedAt: '2026-11-01T22:14:00.000Z',
        files: [file(2, 'fracciones_ana_corregido.pdf', 'application/pdf', 312904), file(3, 'ejercicio_4.jpg', 'image/jpeg', 1048210)],
      },
    ],
    reviews: [
      { id: 1, attemptId: 1, decision: 'REJECTED', feedback: 'Falta el procedimiento en los ejercicios 3 y 4. Recuerda simplificar hasta la mínima expresión.', score: null, createdAt: '2026-10-31T15:20:00.000Z', reviewer: teacher },
    ],
  },
  {
    id: 2, status: 'SUBMITTED', score: null, version: 1, isLate: false, attemptCount: 1,
    lastSubmittedAt: '2026-10-30T19:02:00.000Z', reviewedAt: null, lastFeedback: null,
    student: student(2, 'A002', 'Bruno', 'Castillo'),
    attempts: [{ id: 3, number: 1, comment: null, isLate: false, submittedAt: '2026-10-30T19:02:00.000Z', files: [file(4, 'Guia-Bruno.pdf', 'application/pdf', 198442)] }],
    reviews: [],
  },
  {
    id: 3, status: 'REJECTED', score: null, version: 2, isLate: false, attemptCount: 1,
    lastSubmittedAt: '2026-10-29T23:40:00.000Z', reviewedAt: '2026-10-31T15:35:00.000Z',
    lastFeedback: 'La foto está borrosa y no se leen los ejercicios 6 a 10. Vuelve a subirla con buena luz.',
    student: student(3, 'A003', 'Camila', 'Ruiz'),
    attempts: [{ id: 4, number: 1, comment: 'Lo hice en el cuaderno.', isLate: false, submittedAt: '2026-10-29T23:40:00.000Z', files: [file(5, 'IMG_2041.jpg', 'image/jpeg', 2211980)] }],
    reviews: [
      { id: 2, attemptId: 4, decision: 'REJECTED', feedback: 'La foto está borrosa y no se leen los ejercicios 6 a 10. Vuelve a subirla con buena luz.', score: null, createdAt: '2026-10-31T15:35:00.000Z', reviewer: teacher },
    ],
  },
  {
    id: 4, status: 'PENDING', score: null, version: 0, isLate: false, attemptCount: 0,
    lastSubmittedAt: null, reviewedAt: null, lastFeedback: null,
    student: student(4, 'A004', 'Diego', 'Morales'),
    attempts: [], reviews: [],
  },
  {
    id: 5, status: 'APPROVED', score: 18.5, version: 2, isLate: false, attemptCount: 1,
    lastSubmittedAt: '2026-10-28T21:10:00.000Z', reviewedAt: '2026-10-31T15:50:00.000Z',
    lastFeedback: '¡Muy buen trabajo! Solo revisa el ejercicio 9.',
    student: student(5, 'A005', 'Elena', 'Pérez'),
    attempts: [{ id: 5, number: 1, comment: null, isLate: false, submittedAt: '2026-10-28T21:10:00.000Z', files: [file(6, 'elena_perez_fracciones.pdf', 'application/pdf', 256001)] }],
    reviews: [
      { id: 3, attemptId: 5, decision: 'APPROVED', feedback: '¡Muy buen trabajo! Solo revisa el ejercicio 9.', score: 18.5, createdAt: '2026-10-31T15:50:00.000Z', reviewer: teacher },
    ],
  },
  {
    id: 6, status: 'SUBMITTED', score: null, version: 1, isLate: true, attemptCount: 1,
    lastSubmittedAt: '2026-11-02T01:30:00.000Z', reviewedAt: null, lastFeedback: null,
    student: student(6, 'A006', 'Fernando', 'Soto'),
    attempts: [{ id: 6, number: 1, comment: 'Disculpe la tardanza, estuve enfermo.', isLate: true, submittedAt: '2026-11-02T01:30:00.000Z', files: [file(7, 'tarea fracciones.pdf', 'application/pdf', 143770)] }],
    reviews: [],
  },
];

const ORDER = { SUBMITTED: 0, REJECTED: 1, PENDING: 2, APPROVED: 3 };
let nextReviewId = 100;

function findOrThrow(submissionId) {
  const submission = submissions.find((item) => item.id === Number(submissionId));
  if (!submission) throw new ApiError(404, { code: 'NOT_FOUND', message: 'Entrega no encontrada' });
  return submission;
}

export async function listForActivity(activityId) {
  await wait();
  if (activityId !== activity.id) throw new ApiError(404, { code: 'NOT_FOUND', message: 'Actividad no encontrada' });

  const summary = { PENDING: 0, SUBMITTED: 0, REJECTED: 0, APPROVED: 0, total: submissions.length };
  for (const { status } of submissions) summary[status] += 1;

  const items = [...submissions]
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.student.lastName.localeCompare(b.student.lastName))
    .map(({ attempts, reviews, lastFeedback, ...item }) => clone(item));

  return { activity: clone(activity), summary, items };
}

export async function getDetail(submissionId) {
  await wait();
  const { ...submission } = findOrThrow(submissionId);
  return clone({ ...submission, activity: { id: activity.id, title: activity.title, dueAt: activity.dueAt, maxScore: activity.maxScore, courseId: activity.courseId } });
}

function review(submissionId, decision, { score = null, feedback = null, version }) {
  const submission = findOrThrow(submissionId);
  if (submission.version !== version) {
    throw new ApiError(409, { code: 'VERSION_CONFLICT', message: 'Esta entrega cambió mientras la revisabas. Recarga para ver su estado actual.' });
  }
  if (submission.status !== 'SUBMITTED') {
    throw new ApiError(422, { code: 'INVALID_TRANSITION', message: `No se puede revisar una entrega en estado ${submission.status}` });
  }
  if (score !== null && score > activity.maxScore) {
    throw new ApiError(422, { code: 'SCORE_OUT_OF_RANGE', message: `La nota máxima es ${activity.maxScore}` });
  }

  const now = new Date().toISOString();
  Object.assign(submission, { status: decision, score, lastFeedback: feedback, version: version + 1, reviewedAt: now });
  submission.reviews.push({
    id: nextReviewId++,
    attemptId: submission.attempts.at(-1).id,
    decision,
    feedback,
    score,
    createdAt: now,
    reviewer: teacher,
  });

  const { id, status, lastFeedback, reviewedAt } = submission;
  return { id, status, score, lastFeedback, version: submission.version, reviewedAt };
}

export async function approve(submissionId, body) {
  await wait();
  return review(submissionId, 'APPROVED', { ...body, feedback: body.feedback?.trim() || null });
}

export async function reject(submissionId, body) {
  await wait();
  const feedback = body.feedback?.trim() ?? '';
  if (feedback.length < 5) {
    throw new ApiError(400, { code: 'VALIDATION_ERROR', message: 'El comentario de corrección es obligatorio (mínimo 5 caracteres)' });
  }
  return review(submissionId, 'REJECTED', { ...body, feedback, score: null });
}
