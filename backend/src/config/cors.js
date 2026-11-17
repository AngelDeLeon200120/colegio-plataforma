import { env } from './env.js';
import { AppError } from '../core/errors/AppError.js';

// Solo en desarrollo: enlace temporal de presentación (Cloudflare Tunnel), cuyo subdominio cambia cada vez
const DEV_TUNNEL = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;

/** Sin Origin = misma máquina, curl o health checks. */
export function isAllowedOrigin(origin) {
  if (!origin || env.corsOrigins.includes(origin)) return true;
  return !env.isProd && DEV_TUNNEL.test(origin);
}

export const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    callback(new AppError(403, 'CORS_NOT_ALLOWED', `Origen no permitido: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600,
};
