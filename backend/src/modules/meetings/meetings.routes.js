import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { meetingsService } from './meetings.service.js';

const id = z.coerce.number().int().positive();
const httpsUrl = z
  .string()
  .trim()
  .url('Enlace no válido')
  .max(500)
  .refine((value) => value.startsWith('https://'), 'El enlace debe empezar con https://');

const fields = {
  title: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres').max(150),
  description: z.string().trim().max(1000).nullable(),
  startsAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(5).max(600),
  provider: z.enum(['JITSI', 'EXTERNAL']),
  externalUrl: httpsUrl.nullable(),
};

const createBody = z
  .object({
    ...fields,
    description: fields.description.optional(),
    durationMinutes: fields.durationMinutes.default(45),
    provider: fields.provider.default('JITSI'),
    externalUrl: fields.externalUrl.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.provider === 'EXTERNAL' && !value.externalUrl) ctx.addIssue({ code: 'custom', path: ['externalUrl'], message: 'Pega el enlace de la reunión' });
  });
const updateBody = z.object(Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])));

const listQuery = z.object({
  courseId: id.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const staff = authorize('TEACHER', 'ADMIN');

// Todos ven las reuniones de sus clases; programarlas es del docente del curso o la administración
export const meetingsRouter = Router();

meetingsRouter.get('/meetings', validate({ query: listQuery }), async (req, res) => {
  res.json({ data: await meetingsService.list(req.user, req.valid.query) });
});

meetingsRouter.get('/meetings/by-code/:code', validate({ params: z.object({ code: z.string().trim().min(4).max(20) }) }), async (req, res) => {
  res.json({ data: await meetingsService.findByCode(req.user, req.valid.params.code) });
});

meetingsRouter.post('/courses/:courseId/meetings', staff, validate({ params: z.object({ courseId: id }), body: createBody }), async (req, res) => {
  res.status(201).json({ data: await meetingsService.create(req.user, req.valid.params.courseId, req.valid.body) });
});

meetingsRouter.patch('/meetings/:meetingId', staff, validate({ params: z.object({ meetingId: id }), body: updateBody }), async (req, res) => {
  res.json({ data: await meetingsService.update(req.user, req.valid.params.meetingId, req.valid.body) });
});

meetingsRouter.post('/meetings/:meetingId/cancel', staff, validate({ params: z.object({ meetingId: id }) }), async (req, res) => {
  res.json({ data: await meetingsService.cancel(req.user, req.valid.params.meetingId) });
});
