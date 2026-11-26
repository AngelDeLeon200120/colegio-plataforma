import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { attendanceService } from './attendance.service.js';

const id = z.coerce.number().int().positive();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
  .refine((value) => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value), 'Fecha inválida');

const courseParams = z.object({ courseId: id });
const removeQuery = z.object({ date });
const day = z.object({
  date,
  entries: z
    .array(
      z.object({
        studentId: id,
        // null: celda vacía (se quita la marca de ese estudiante en ese día)
        status: z.enum(['PRESENT', 'ABSENT', 'EXCUSED']).nullable(),
        note: z
          .string()
          .trim()
          .max(200, 'La nota puede tener hasta 200 caracteres')
          .nullable()
          .optional()
          .transform((value) => value || null),
      }),
    )
    .min(1)
    .max(500)
    .refine((entries) => new Set(entries.map((entry) => entry.studentId)).size === entries.length, 'Hay estudiantes repetidos'),
});
const saveBody = z.object({
  days: z
    .array(day)
    .min(1)
    .max(200)
    .refine((days) => new Set(days.map((item) => item.date)).size === days.length, 'Hay días repetidos'),
});

// Solo docentes: cada quien pasa lista en sus propios cursos
const teacher = authorize('TEACHER');

export const attendanceRouter = Router();

attendanceRouter.get('/courses/:courseId/attendance', teacher, validate({ params: courseParams }), async (req, res) => {
  res.json({ data: await attendanceService.getSheet(req.user, req.valid.params.courseId) });
});

attendanceRouter.put('/courses/:courseId/attendance', teacher, validate({ params: courseParams, body: saveBody }), async (req, res) => {
  res.json({ data: await attendanceService.save(req.user, req.valid.params.courseId, req.valid.body) });
});

attendanceRouter.delete('/courses/:courseId/attendance', teacher, validate({ params: courseParams, query: removeQuery }), async (req, res) => {
  res.json({ data: await attendanceService.removeDay(req.user, req.valid.params.courseId, req.valid.query) });
});
