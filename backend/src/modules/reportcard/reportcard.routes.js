import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { reportCardService } from './reportcard.service.js';

const query = z.object({
  studentId: z.coerce.number().int().positive().optional(), // familias: de qué hijo o hija
  unitId: z.coerce.number().int().positive().optional(), // por defecto, la unidad activa
});

export const reportCardRouter = Router();

reportCardRouter.get('/me/report-card', authorize('STUDENT', 'PARENT'), validate({ query }), async (req, res) => {
  res.json({ data: await reportCardService.get(req.user, req.valid.query) });
});
