import { Router } from 'express';
import { z } from 'zod';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { staffChatService } from './staffchat.service.js';

const id = z.coerce.number().int().positive();
const listQuery = z.object({ before: id.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });

// Sala del personal: administración y todos los docentes del colegio
export const staffChatRouter = Router();
staffChatRouter.use('/staff-chat', authorize('TEACHER', 'ADMIN'));

staffChatRouter.get('/staff-chat/messages', validate({ query: listQuery }), async (req, res) => {
  res.json({ data: await staffChatService.messages(req.user, req.valid.query) });
});

staffChatRouter.get('/staff-chat/members', async (req, res) => {
  res.json({ data: await staffChatService.members() });
});

staffChatRouter.get('/staff-chat/unread-count', async (req, res) => {
  res.json({ data: await staffChatService.unreadCount(req.user) });
});

staffChatRouter.post('/staff-chat/messages', validate({ body: z.object({ body: z.string().trim().min(1, 'Escribe el mensaje').max(4000) }) }), async (req, res) => {
  res.status(201).json({ data: await staffChatService.send(req.user, req.valid.body.body) });
});

staffChatRouter.delete('/staff-chat/messages/:messageId', validate({ params: z.object({ messageId: id }) }), async (req, res) => {
  await staffChatService.remove(req.user, req.valid.params.messageId);
  res.status(204).end();
});

staffChatRouter.post('/staff-chat/read', validate({ body: z.object({ messageId: id }) }), async (req, res) => {
  res.json({ data: await staffChatService.markRead(req.user, req.valid.body.messageId) });
});
