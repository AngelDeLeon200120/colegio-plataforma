import { Router } from 'express';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { submissionsController as controller } from './submissions.controller.js';
import { activityParams, approveBody, listQuery, rejectBody, submissionParams } from './submissions.schemas.js';

export const submissionsRouter = Router();

const staff = authorize('TEACHER', 'ADMIN');

submissionsRouter.get(
  '/activities/:activityId/submissions',
  staff,
  validate({ params: activityParams, query: listQuery }),
  controller.listForActivity,
);

submissionsRouter.get('/submissions/:submissionId', staff, validate({ params: submissionParams }), controller.getDetail);

submissionsRouter.post(
  '/submissions/:submissionId/approve',
  staff,
  validate({ params: submissionParams, body: approveBody }),
  controller.approve,
);

submissionsRouter.post(
  '/submissions/:submissionId/reject',
  staff,
  validate({ params: submissionParams, body: rejectBody }),
  controller.reject,
);
