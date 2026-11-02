import { Router } from 'express';
import { pingDatabase } from '../../config/database.js';
import { AppError } from '../../core/errors/AppError.js';

export const healthRouter = Router();

healthRouter.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

healthRouter.get('/ready', async (req, res) => {
  try {
    await pingDatabase();
  } catch {
    throw new AppError(503, 'DB_UNAVAILABLE', 'La base de datos no responde');
  }
  res.json({ status: 'ready' });
});
