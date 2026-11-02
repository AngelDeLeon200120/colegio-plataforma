import { Router } from 'express';
import { authenticate } from './core/middleware/authenticate.js';
import { jobsRouter } from './jobs/jobs.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { authRouter, publicAuthRouter } from './modules/auth/auth.routes.js';
import { academicRouter } from './modules/academic/academic.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { activitiesRouter } from './modules/activities/activities.routes.js';
import { filesRouter, publicFilesRouter } from './modules/files/files.routes.js';
import { financeRouter } from './modules/finance/finance.routes.js';
import { gradebookRouter } from './modules/gradebook/gradebook.routes.js';
import { homeworkRouter } from './modules/homework/homework.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { reportCardRouter } from './modules/reportcard/reportcard.routes.js';
import { submissionsRouter } from './modules/submissions/submissions.routes.js';

export const apiRouter = Router();

// Rutas públicas (la descarga de archivos lleva su propio token firmado)
apiRouter.use(healthRouter);
apiRouter.use(publicAuthRouter);
apiRouter.use(publicFilesRouter);

// Todo lo que sigue requiere JWT y corre dentro del contexto del colegio
apiRouter.use(authenticate);
apiRouter.use(authRouter);
apiRouter.use(adminRouter);
apiRouter.use(academicRouter);
apiRouter.use(filesRouter);
apiRouter.use(notificationsRouter);
apiRouter.use(submissionsRouter);
apiRouter.use(activitiesRouter);
apiRouter.use(homeworkRouter);
apiRouter.use(reportCardRouter);
apiRouter.use(gradebookRouter);
apiRouter.use(financeRouter);
apiRouter.use(jobsRouter);
