import { Router } from 'express';
import { authorize } from '../../core/middleware/authorize.js';
import { academicRepository } from './academic.repository.js';

export const academicRouter = Router();

// Docente: sus cursos. Administración: todos los del ciclo activo.
academicRouter.get('/me/courses', authorize('TEACHER', 'ADMIN'), async (req, res) => {
  const teacherId = req.user.role === 'TEACHER' ? req.user.id : null;
  res.json({ data: await academicRepository.listActiveCourses(teacherId) });
});
