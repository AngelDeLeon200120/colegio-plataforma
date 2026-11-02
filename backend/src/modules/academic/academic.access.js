import { AppError } from '../../core/errors/AppError.js';

// El rol ya se validó en la ruta; aquí se valida la relación con el curso.
export function assertCourseStaff(user, teacherId, message = 'Solo el docente asignado al curso puede hacer esto') {
  if (user.role === 'ADMIN') return;
  if (user.role === 'TEACHER' && user.id === teacherId) return;
  throw AppError.forbidden(message);
}
