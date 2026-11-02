import cron from 'node-cron';
import { env } from '../config/env.js';
import { runWithTenant } from '../core/middleware/tenantContext.js';
import { localClock } from '../core/utils/dates.js';
import { logger } from '../core/utils/logger.js';
import { dueSoonRemindersJob } from './dueSoonReminders.job.js';
import { jobRunsRepository, listSchoolsForJobs } from './jobs.repository.js';
import { paymentRemindersJob } from './paymentReminders.job.js';
import { submissionRemindersJob } from './submissionReminders.job.js';
import { unitActivationJob } from './unitActivation.job.js';

export const JOBS = [unitActivationJob, submissionRemindersJob, paymentRemindersJob, dueSoonRemindersJob];

const minutesOf = (hhmm) => {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Ejecuta un job para un colegio dentro de su contexto de tenant.
 * `runKey` identifica la ejecución (la fecha local para las diarias): con el
 * UNIQUE de job_runs, aunque haya varias réplicas solo una la ejecuta.
 * Devuelve null si ya se ejecutó con esa clave.
 */
export function runJob(job, school, { runKey, now = new Date() }) {
  return runWithTenant({ schoolId: school.id, userId: null, role: 'SYSTEM' }, async () => {
    const runId = await jobRunsRepository.tryStart(job.name, runKey);
    if (!runId) return null;

    const startedAt = Date.now();
    try {
      const stats = { ...(await job.run({ school, now })), durationMs: Date.now() - startedAt };
      await jobRunsRepository.finish(runId, { status: 'SUCCEEDED', stats });
      logger.info({ job: job.name, schoolId: school.id, runKey, stats }, 'Job terminado');
      return { id: runId, status: 'SUCCEEDED', stats };
    } catch (err) {
      logger.error({ err, job: job.name, schoolId: school.id, runKey }, 'Job fallido');
      await jobRunsRepository.finish(runId, { status: 'FAILED', error: String(err.stack ?? err).slice(0, 5000) });
      return { id: runId, status: 'FAILED', error: err.message };
    }
  });
}

/**
 * Para cada colegio, ejecuta los jobs cuya hora local ya pasó hoy y aún no corrieron.
 * Si el servidor estuvo apagado a la hora programada, se pone al día en el siguiente tick.
 */
export async function runDueJobs(now = new Date()) {
  const schools = await listSchoolsForJobs();
  for (const school of schools) {
    const clock = localClock(now, school.timezone);
    for (const job of JOBS) {
      if (clock.minutes < minutesOf(job.at)) continue;
      await runJob(job, school, { runKey: clock.date, now });
    }
  }
}

/** Un único cron en UTC cada 15 min despacha a cada colegio según su zona horaria. */
export function startScheduler() {
  if (!env.JOBS_ENABLED) {
    logger.info('Tareas programadas desactivadas (JOBS_ENABLED=false)');
    return null;
  }

  const tick = () => runDueJobs().catch((err) => logger.error({ err }, 'Tick del programador fallido'));
  const task = cron.schedule('*/15 * * * *', tick, { timezone: 'UTC', name: 'jobs-dispatcher', noOverlap: true });
  tick();
  logger.info({ jobs: JOBS.map((job) => `${job.name}@${job.at}`) }, 'Programador de tareas iniciado');
  return task;
}
