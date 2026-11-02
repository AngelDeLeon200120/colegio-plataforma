import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../core/middleware/validate.js';
import { notificationsService } from './notifications.service.js';

const listQuery = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  unread: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const readBody = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
});

// Cada usuario solo ve y marca sus propias notificaciones (recipient_id = req.user.id)
export const notificationsRouter = Router();

notificationsRouter.get('/notifications', validate({ query: listQuery }), async (req, res) => {
  res.json({ data: await notificationsService.list(req.user, req.valid.query) });
});

notificationsRouter.get('/notifications/unread-count', async (req, res) => {
  res.json({ data: await notificationsService.unreadCount(req.user) });
});

notificationsRouter.post('/notifications/read', validate({ body: readBody }), async (req, res) => {
  res.json({ data: await notificationsService.markRead(req.user, req.valid.body.ids) });
});

notificationsRouter.post('/notifications/read-all', async (req, res) => {
  res.json({ data: await notificationsService.markAllRead(req.user) });
});
