import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../core/middleware/authorize.js';
import { upload } from '../../core/middleware/upload.js';
import { validate } from '../../core/middleware/validate.js';
import { CHAT_EXTENSIONS } from '../../core/security/fileSignature.js';
import { staffChatService } from './staffchat.service.js';

const id = z.coerce.number().int().positive();
const listQuery = z.object({ before: id.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });

// Sala del personal: administración y todos los docentes del colegio
export const staffChatRouter = Router();
staffChatRouter.use('/staff-chat', authorize('TEACHER', 'ADMIN'));

// La administración decide quién está en la sala
const admin = authorize('ADMIN');
staffChatRouter.get('/staff-chat/roster', admin, async (req, res) => {
  res.json({ data: await staffChatService.roster() });
});
staffChatRouter.put(
  '/staff-chat/members/:userId',
  admin,
  validate({ params: z.object({ userId: id }), body: z.object({ included: z.boolean() }) }),
  async (req, res) => {
    res.json({ data: await staffChatService.setMembership(req.user, req.valid.params.userId, req.valid.body.included) });
  },
);

staffChatRouter.get('/staff-chat/unread-count', async (req, res) => {
  res.json({ data: await staffChatService.unreadCount(req.user) });
});

// Lo demás: solo quien está en la sala
staffChatRouter.use('/staff-chat', async (req, res, next) => {
  await staffChatService.assertMember(req.user);
  next();
});

staffChatRouter.get('/staff-chat/messages', validate({ query: listQuery }), async (req, res) => {
  res.json({ data: await staffChatService.messages(req.user, req.valid.query) });
});

staffChatRouter.get('/staff-chat/members', async (req, res) => {
  res.json({ data: await staffChatService.members() });
});

// Hasta 5 adjuntos de 50 MB (fotos, videos, documentos). También acepta JSON solo con texto.
const attachments = upload({ extensions: CHAT_EXTENSIONS, maxBytes: 50 * 1024 * 1024, maxFiles: 5 }).array('files', 5);
const sendBody = z.object({ body: z.string().trim().max(4000).optional().transform((value) => value || null) });

staffChatRouter.post('/staff-chat/messages', attachments, validate({ body: sendBody }), async (req, res) => {
  res.status(201).json({ data: await staffChatService.send(req.user, req.valid.body.body, req.files ?? []) });
});

staffChatRouter.delete('/staff-chat/messages/:messageId', validate({ params: z.object({ messageId: id }) }), async (req, res) => {
  await staffChatService.remove(req.user, req.valid.params.messageId);
  res.status(204).end();
});

staffChatRouter.post('/staff-chat/read', validate({ body: z.object({ messageId: id }) }), async (req, res) => {
  res.json({ data: await staffChatService.markRead(req.user, req.valid.body.messageId) });
});
