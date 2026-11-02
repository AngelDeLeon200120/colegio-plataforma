import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../errors/AppError.js';
import { isSessionValid } from '../security/sessionGuard.js';
import { runWithTenant } from './tenantContext.js';

// Los tokens de acceso llevan audience "api"; los de descarga de archivos, "file".
// Así una URL firmada de un archivo nunca sirve como sesión.
export const ACCESS_TOKEN_AUDIENCE = 'api';

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], audience: ACCESS_TOKEN_AUDIENCE });
  return {
    id: Number(payload.sub),
    schoolId: Number(payload.sid),
    role: payload.role,
    tokenVersion: payload.tv,
  };
}

/**
 * Valida el Bearer token y abre el contexto de tenant para el resto de la petición.
 * El school_id sale únicamente del token firmado.
 */
export async function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) throw AppError.unauthorized();

  try {
    req.user = verifyAccessToken(token);
  } catch (err) {
    throw err.name === 'TokenExpiredError'
      ? AppError.unauthorized('TOKEN_EXPIRED', 'La sesión expiró')
      : AppError.unauthorized('INVALID_TOKEN', 'Token inválido');
  }

  // Cuenta deshabilitada o "cerrar todas las sesiones"
  if (!(await isSessionValid(req.user))) {
    throw AppError.unauthorized('SESSION_REVOKED', 'Tu sesión ya no es válida. Inicia sesión de nuevo.');
  }

  runWithTenant({ schoolId: req.user.schoolId, userId: req.user.id, role: req.user.role }, next);
}
