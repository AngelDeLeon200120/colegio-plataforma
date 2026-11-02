import { rateLimit } from 'express-rate-limit';
import { AppError } from '../errors/AppError.js';

const tooMany = (req, res, next) =>
  next(new AppError(429, 'RATE_LIMITED', 'Demasiadas solicitudes, intenta de nuevo en un momento'));

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany,
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany,
});
