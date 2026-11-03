import { Router } from 'express';
import { validate } from '../../core/middleware/validate.js';
import { createBody, listQuery, replyBody, threadParams } from './messages.schemas.js';
import { messagesService } from './messages.service.js';

// Todos los roles: qué hilos ve y a quién escribe cada persona se decide en el servicio
export const messagesRouter = Router();

messagesRouter.get('/messages/threads', validate({ query: listQuery }), async (req, res) => {
  res.json({ data: await messagesService.list(req.user, req.valid.query) });
});

messagesRouter.get('/messages/unread-count', async (req, res) => {
  res.json({ data: await messagesService.unreadCount(req.user) });
});

messagesRouter.get('/messages/recipients', async (req, res) => {
  res.json({ data: await messagesService.recipients(req.user) });
});

messagesRouter.post('/messages/threads', validate({ body: createBody }), async (req, res) => {
  res.status(201).json({ data: await messagesService.create(req.user, req.valid.body) });
});

messagesRouter.get('/messages/threads/:threadId', validate({ params: threadParams }), async (req, res) => {
  res.json({ data: await messagesService.get(req.user, req.valid.params.threadId) });
});

messagesRouter.post('/messages/threads/:threadId/messages', validate({ params: threadParams, body: replyBody }), async (req, res) => {
  res.status(201).json({ data: await messagesService.reply(req.user, req.valid.params.threadId, req.valid.body.body) });
});
