import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { conductService } from './conduct.service.js';

const id = z.coerce.number().int().positive();
const CATEGORIES = ['LLEGADA_TARDE', 'FALTA_RESPETO', 'INDISCIPLINA', 'CELULAR', 'TAREA_COPIADA', 'OTRO'];
const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

const studentsQuery = z.object({ sectionId: id.optional() });
const reportsQuery = z.object({
  studentId: id.optional(),
  sectionId: id.optional(),
  category: z.enum(CATEGORIES).optional(),
  includeVoid: flag.default('false'),
});
const createBody = z.object({
  studentId: id,
  category: z.enum(CATEGORIES),
  description: z.string().trim().min(5, 'Escribe qué pasó (mínimo 5 caracteres)').max(2000),
  incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
});
const voidBody = z.object({ reason: z.string().trim().min(5, 'Indica el motivo (mínimo 5 caracteres)').max(300) });
const followupsQuery = z.object({ status: z.enum(['PENDIENTE', 'PROGRAMADO', 'RESUELTO']).optional() });
const followupBody = z
  .object({
    status: z.enum(['PENDIENTE', 'PROGRAMADO', 'RESUELTO']).optional(),
    decision: z.enum(['CITA_FAMILIA', 'REUNION_TUTOR', 'OTRA']).nullable().optional(),
    meetingAt: z.coerce.date().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    outcome: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), 'No hay cambios');

const staff = authorize('TEACHER', 'ADMIN');
const admin = authorize('ADMIN');

// Reportes de conducta: los crean docentes y administración; la familia los consulta
export const conductRouter = Router();

conductRouter.get('/conduct/students', staff, validate({ query: studentsQuery }), async (req, res) => {
  res.json({ data: await conductService.students(req.user, req.valid.query) });
});

conductRouter.get('/conduct/reports', staff, validate({ query: reportsQuery }), async (req, res) => {
  res.json({ data: await conductService.reports(req.user, req.valid.query) });
});

conductRouter.post('/conduct/reports', staff, validate({ body: createBody }), async (req, res) => {
  res.status(201).json({ data: await conductService.create(req.user, req.valid.body) });
});

conductRouter.post('/conduct/reports/:reportId/void', admin, validate({ params: z.object({ reportId: id }), body: voidBody }), async (req, res) => {
  res.json({ data: await conductService.void(req.user, req.valid.params.reportId, req.valid.body) });
});

conductRouter.get('/conduct/followups', staff, validate({ query: followupsQuery }), async (req, res) => {
  res.json({ data: await conductService.followups(req.user, req.valid.query) });
});

conductRouter.patch('/conduct/followups/:followupId', admin, validate({ params: z.object({ followupId: id }), body: followupBody }), async (req, res) => {
  res.json({ data: await conductService.updateFollowup(req.user, req.valid.params.followupId, req.valid.body) });
});

conductRouter.get('/me/conduct', authorize('PARENT'), validate({ query: z.object({ studentId: id }) }), async (req, res) => {
  res.json({ data: await conductService.family(req.user, req.valid.query) });
});
