import { Router } from 'express';
import { authorize } from '../../core/middleware/authorize.js';
import { upload } from '../../core/middleware/upload.js';
import { validate } from '../../core/middleware/validate.js';
import { SUBMISSION_EXTENSIONS } from '../../core/security/fileSignature.js';
import { activityParams, submitBody, viewerQuery } from './homework.schemas.js';
import { homeworkService } from './homework.service.js';

export const MAX_SUBMISSION_FILES = 5;
export const MAX_SUBMISSION_BYTES = 20 * 1024 * 1024;

export const homeworkRouter = Router();

const studentOrFamily = authorize('STUDENT', 'PARENT');
const submissionUpload = upload({
  extensions: SUBMISSION_EXTENSIONS,
  maxBytes: MAX_SUBMISSION_BYTES,
  maxFiles: MAX_SUBMISSION_FILES,
}).array('files', MAX_SUBMISSION_FILES);

homeworkRouter.get('/me/activities', studentOrFamily, validate({ query: viewerQuery }), async (req, res) => {
  res.json({ data: await homeworkService.listActivities(req.user, req.valid.query) });
});

homeworkRouter.get(
  '/me/activities/:activityId',
  studentOrFamily,
  validate({ params: activityParams, query: viewerQuery }),
  async (req, res) => {
    res.json({ data: await homeworkService.getActivity(req.user, req.valid.params.activityId, req.valid.query) });
  },
);

// multer antes de validate: el comentario llega en el mismo multipart que los archivos
homeworkRouter.post(
  '/me/activities/:activityId/attempts',
  authorize('STUDENT'),
  submissionUpload,
  validate({ params: activityParams, body: submitBody }),
  async (req, res) => {
    res.status(201).json({ data: await homeworkService.submit(req.user, req.valid.params.activityId, req.valid.body, req.files) });
  },
);
