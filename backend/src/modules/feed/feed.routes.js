import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../core/middleware/authorize.js';
import { upload } from '../../core/middleware/upload.js';
import { validate } from '../../core/middleware/validate.js';
import { POST_IMAGE_EXTENSIONS, feedService } from './feed.service.js';

const id = z.coerce.number().int().positive();
// En multipart los booleanos llegan como texto
const flag = z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')]);

const postParams = z.object({ postId: id });
const commentParams = z.object({ commentId: id });
const listQuery = z.object({ cursor: id.optional(), limit: z.coerce.number().int().min(1).max(30).default(10) });
const createBody = z.object({
  body: z.string().trim().min(1, 'Escribe la publicación').max(5000),
  isPinned: flag.default(false),
});
const updateBody = z
  .object({ body: z.string().trim().min(1).max(5000).optional(), isPinned: z.boolean().optional() })
  .refine((value) => value.body !== undefined || value.isPinned !== undefined, 'Nada que cambiar');
const reactBody = z.object({ on: z.boolean() });
const commentBody = z.object({ body: z.string().trim().min(1, 'Escribe el comentario').max(1000) });

const admin = authorize('ADMIN');
const imageUpload = upload({ extensions: POST_IMAGE_EXTENSIONS, maxBytes: 8 * 1024 * 1024 }).single('image');

// Todos los roles leen, reaccionan y comentan; solo la administración publica
export const feedRouter = Router();

feedRouter.get('/feed/posts', validate({ query: listQuery }), async (req, res) => {
  res.json({ data: await feedService.list(req.user, req.valid.query) });
});

feedRouter.post('/feed/posts', admin, imageUpload, validate({ body: createBody }), async (req, res) => {
  res.status(201).json({ data: await feedService.create(req.user, req.valid.body, req.file) });
});

feedRouter.patch('/feed/posts/:postId', admin, validate({ params: postParams, body: updateBody }), async (req, res) => {
  res.json({ data: await feedService.update(req.user, req.valid.params.postId, req.valid.body) });
});

feedRouter.delete('/feed/posts/:postId', admin, validate({ params: postParams }), async (req, res) => {
  await feedService.remove(req.user, req.valid.params.postId);
  res.status(204).end();
});

feedRouter.put('/feed/posts/:postId/reaction', validate({ params: postParams, body: reactBody }), async (req, res) => {
  res.json({ data: await feedService.react(req.user, req.valid.params.postId, req.valid.body.on) });
});

feedRouter.get('/feed/posts/:postId/comments', validate({ params: postParams }), async (req, res) => {
  res.json({ data: await feedService.comments(req.user, req.valid.params.postId) });
});

feedRouter.post('/feed/posts/:postId/comments', validate({ params: postParams, body: commentBody }), async (req, res) => {
  res.status(201).json({ data: await feedService.comment(req.user, req.valid.params.postId, req.valid.body.body) });
});

feedRouter.delete('/feed/comments/:commentId', validate({ params: commentParams }), async (req, res) => {
  await feedService.removeComment(req.user, req.valid.params.commentId);
  res.status(204).end();
});
