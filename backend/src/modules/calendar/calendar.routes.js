import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { calendarService } from './calendar.service.js';

export const EVENT_CATEGORIES = ['GENERAL', 'FERIADO', 'EVALUACION', 'REUNION', 'ACTO', 'DEPORTE'];

const id = z.coerce.number().int().positive();
const fields = {
  title: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres').max(150),
  description: z.string().trim().max(1000).nullable(),
  category: z.enum(EVENT_CATEGORIES),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  allDay: z.boolean(),
  location: z.string().trim().max(150).nullable(),
  sectionId: id.nullable(),
};

const createBody = z
  .object({
    ...fields,
    description: fields.description.optional(),
    category: fields.category.default('GENERAL'),
    allDay: fields.allDay.default(false),
    location: fields.location.optional(),
    sectionId: fields.sectionId.optional(),
  })
  .refine((value) => value.endsAt >= value.startsAt, { path: ['endsAt'], message: 'El fin debe ser posterior al inicio' });
const updateBody = z.object(Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])));
const rangeQuery = z.object({ from: z.coerce.date(), to: z.coerce.date() });
const eventParams = z.object({ eventId: id });

const admin = authorize('ADMIN');

// Todos consultan el calendario; solo la administración crea, cambia o borra eventos
export const calendarRouter = Router();

calendarRouter.get('/calendar', validate({ query: rangeQuery }), async (req, res) => {
  res.json({ data: await calendarService.agenda(req.user, req.valid.query) });
});

calendarRouter.post('/calendar/events', admin, validate({ body: createBody }), async (req, res) => {
  res.status(201).json({ data: await calendarService.create(req.user, req.valid.body) });
});

calendarRouter.patch('/calendar/events/:eventId', admin, validate({ params: eventParams, body: updateBody }), async (req, res) => {
  res.json({ data: await calendarService.update(req.user, req.valid.params.eventId, req.valid.body) });
});

calendarRouter.delete('/calendar/events/:eventId', admin, validate({ params: eventParams }), async (req, res) => {
  await calendarService.remove(req.user, req.valid.params.eventId);
  res.status(204).end();
});
