import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { AppError } from '../core/errors/AppError.js';
import { authorize } from '../core/middleware/authorize.js';
import { validate } from '../core/middleware/validate.js';
import { jobRunsRepository } from './jobs.repository.js';
import { JOBS, runJob } from './scheduler.js';

const jobNames = JOBS.map((job) => job.name);

export const jobsRouter = Router();
jobsRouter.use('/admin/jobs', authorize('ADMIN'));

jobsRouter.get('/admin/jobs', (req, res) => {
  res.json({ data: JOBS.map(({ name, at, description }) => ({ name, at, description })) });
});

jobsRouter.get(
  '/admin/jobs/runs',
  validate({ query: z.object({ job: z.enum(jobNames).optional() }) }),
  async (req, res) => {
    res.json({ data: await jobRunsRepository.listRecent(req.valid.query.job) });
  },
);

/** Ejecuta ahora un job para el colegio del administrador (soporte y pruebas). */
jobsRouter.post(
  '/admin/jobs/:name/run',
  validate({ params: z.object({ name: z.enum(jobNames) }) }),
  async (req, res) => {
    const [rows] = await pool.execute('SELECT id, timezone FROM schools WHERE id = ?', [req.user.schoolId]);
    if (!rows.length) throw AppError.notFound('Colegio no encontrado');

    const job = JOBS.find((candidate) => candidate.name === req.valid.params.name);
    const result = await runJob(job, rows[0], { runKey: `manual-${new Date().toISOString()}` });
    res.json({ data: result });
  },
);
