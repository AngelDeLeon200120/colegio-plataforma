import { Router } from 'express';
import { authorize } from '../../core/middleware/authorize.js';
import { upload } from '../../core/middleware/upload.js';
import { validate } from '../../core/middleware/validate.js';
import { gradebookController as controller } from './gradebook.controller.js';
import {
  courseParams,
  createItemBody,
  deleteItemQuery,
  historyQuery,
  importBody,
  improveBody,
  importParams,
  itemParams,
  paymentStatusQuery,
  saveScoresBody,
  sheetQuery,
  templateQuery,
  updateItemBody,
} from './gradebook.schemas.js';

export const gradebookRouter = Router();

const staff = authorize('TEACHER', 'ADMIN');
const importUpload = upload({ extensions: ['xlsx', 'csv'], maxBytes: 2 * 1024 * 1024 }).single('file');

gradebookRouter.get('/courses/:courseId/gradebook', staff, validate({ params: courseParams, query: sheetQuery }), controller.getSheet);

gradebookRouter.put(
  '/courses/:courseId/gradebook/scores',
  staff,
  validate({ params: courseParams, body: saveScoresBody }),
  controller.saveCells,
);

gradebookRouter.post(
  '/courses/:courseId/gradebook/improvements',
  staff,
  validate({ params: courseParams, body: improveBody }),
  controller.improve,
);
gradebookRouter.get(
  '/courses/:courseId/gradebook/payment-status',
  staff,
  validate({ params: courseParams, query: paymentStatusQuery }),
  controller.paymentStatus,
);
gradebookRouter.get('/courses/:courseId/gradebook/history', staff, validate({ params: courseParams, query: historyQuery }), controller.history);

gradebookRouter.post('/courses/:courseId/grade-items', staff, validate({ params: courseParams, body: createItemBody }), controller.createItem);
gradebookRouter.patch('/grade-items/:itemId', staff, validate({ params: itemParams, body: updateItemBody }), controller.updateItem);
gradebookRouter.delete('/grade-items/:itemId', staff, validate({ params: itemParams, query: deleteItemQuery }), controller.deleteItem);

gradebookRouter.get(
  '/courses/:courseId/gradebook/template',
  staff,
  validate({ params: courseParams, query: templateQuery }),
  controller.downloadTemplate,
);

// multer va antes de validate: el unitId llega en el multipart junto al archivo
gradebookRouter.post(
  '/courses/:courseId/gradebook/imports',
  staff,
  importUpload,
  validate({ params: courseParams, body: importBody }),
  controller.validateImport,
);
gradebookRouter.post('/grade-imports/:importId/apply', staff, validate({ params: importParams }), controller.applyImport);
gradebookRouter.post('/grade-imports/:importId/discard', staff, validate({ params: importParams }), controller.discardImport);
