import { env } from './env.js';
import { AppError } from '../core/errors/AppError.js';

// Solo en desarrollo: enlace temporal de presentación (Cloudflare Tunnel o puerto reenviado de VS Code), cuyo subdominio cambia
const DEV_TUNNEL = /^https:\/\/[a-z0-9-]+\.(trycloudflare\.com|[a-z0-9-]+\.devtunnels\.ms)$/;

// Solo en desarrollo: cualquier IP de la red local (teléfonos y otras computadoras), aunque el router cambie la IP
const DEV_LAN = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):\d{2,5}$/;

/** Sin Origin = misma máquina, curl o health checks. */
export function isAllowedOrigin(origin) {
  if (!origin || env.corsOrigins.includes(origin)) return true;
  return !env.isProd && (DEV_TUNNEL.test(origin) || DEV_LAN.test(origin));
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
