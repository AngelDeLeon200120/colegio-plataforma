import { env } from './env.js';
import { AppError } from '../core/errors/AppError.js';

export const corsOptions = {
  origin(origin, callback) {
    // Sin Origin = misma máquina, curl o health checks
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    callback(new AppError(403, 'CORS_NOT_ALLOWED', `Origen no permitido: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600,
};
