import { Router } from 'express';
import { authorize } from '../../core/middleware/authorize.js';
import { upload } from '../../core/middleware/upload.js';
import { validate } from '../../core/middleware/validate.js';
import { SUBMISSION_EXTENSIONS } from '../../core/security/fileSignature.js';
import { activityParams, courseParams, createBody, listQuery, updateBody } from './activities.schemas.js';
import { activitiesService } from './activities.service.js';

export const activitiesRouter = Router();

const staff = authorize('TEACHER', 'ADMIN');
// Material de apoyo: mismos formatos y límites que las entregas
const resourcesUpload = upload({ extensions: SUBMISSION_EXTENSIONS, maxBytes: 20 * 1024 * 1024, maxFiles: 5 }).array('files', 5);

activitiesRouter.get('/teacher/activities', staff, validate({ query: listQuery }), async (req, res) => {
  res.json({ data: await activitiesService.list(req.user, req.valid.query) });
});

// multer antes de validate: los campos llegan en el mismo multipart que los archivos
activitiesRouter.post(
  '/courses/:courseId/activities',
  staff,
  resourcesUpload,
  validate({ params: courseParams, body: createBody }),
  async (req, res) => {
    res.status(201).json({ data: await activitiesService.create(req.user, req.valid.params.courseId, req.valid.body, req.files) });
  },
);

activitiesRouter.patch('/activities/:activityId', staff, validate({ params: activityParams, body: updateBody }), async (req, res) => {
  res.json({ data: await activitiesService.update(req.user, req.valid.params.activityId, req.valid.body) });
});

activitiesRouter.post('/activities/:activityId/publish', staff, validate({ params: activityParams }), async (req, res) => {
  res.json({ data: await activitiesService.publish(req.user, req.valid.params.activityId) });
});

activitiesRouter.post('/activities/:activityId/close', staff, validate({ params: activityParams }), async (req, res) => {
  res.json({ data: await activitiesService.close(req.user, req.valid.params.activityId) });
});

activitiesRouter.post('/activities/:activityId/reopen', staff, validate({ params: activityParams }), async (req, res) => {
  res.json({ data: await activitiesService.reopen(req.user, req.valid.params.activityId) });
});

activitiesRouter.delete('/activities/:activityId', staff, validate({ params: activityParams }), async (req, res) => {
  await activitiesService.removeDraft(req.user, req.valid.params.activityId);
  res.status(204).end();
});
