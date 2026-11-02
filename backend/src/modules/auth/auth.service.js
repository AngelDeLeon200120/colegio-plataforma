import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/AppError.js';
import { ACCESS_TOKEN_AUDIENCE } from '../../core/middleware/authenticate.js';
import { getDummyHash, verifyPassword } from '../../core/security/password.js';
import { invalidateSession } from '../../core/security/sessionGuard.js';
import { logger } from '../../core/utils/logger.js';
import { emitToUsers } from '../../realtime/emitter.js';
import { authRepository } from './auth.repository.js';

const DAY_MS = 86_400_000;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function signAccessToken(user) {
  return jwt.sign({ sid: user.schoolId, role: user.role, tv: user.tokenVersion }, env.JWT_ACCESS_SECRET, {
    subject: String(user.id),
    audience: ACCESS_TOKEN_AUDIENCE,
    expiresIn: env.JWT_ACCESS_TTL,
    algorithm: 'HS256',
  });
}

async function toSessionUser(user) {
  const sessionUser = {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    school: { id: user.school.id, name: user.school.name, slug: user.school.slug, timezone: user.school.timezone },
  };
  if (user.role === 'PARENT') sessionUser.children = await authRepository.findChildren(user.schoolId, user.id);
  return sessionUser;
}

/**
 * Crea un refresh token nuevo (opaco, solo su hash se guarda) y el access token.
 * `familyId` agrupa las rotaciones de una misma sesión/dispositivo.
 */
async function createSession(user, meta, familyId = randomUUID()) {
  const refreshToken = randomBytes(48).toString('base64url');
  await authRepository.insertRefreshToken({
    schoolId: user.schoolId,
    userId: user.id,
    tokenHash: sha256(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * DAY_MS),
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 255) ?? null,
  });

  return {
    refreshToken,
    session: { accessToken: signAccessToken(user), user: await toSessionUser(user) },
  };
}

function assertCanSignIn(user) {
  if (user.school.status === 'SUSPENDED') {
    throw new AppError(403, 'SCHOOL_SUSPENDED', 'El acceso del colegio está suspendido. Contacta a la administración.');
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Tu cuenta no está activa. Contacta a la administración del colegio.');
  }
}

export const authService = {
  async login({ schoolSlug, email, password }, meta) {
    const user = await authRepository.findLoginCandidate(schoolSlug, email);
    // Siempre se verifica un hash, exista o no el usuario: mismo tiempo de respuesta
    const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));

    if (!user || !valid) {
      throw AppError.unauthorized('INVALID_CREDENTIALS', 'Colegio, correo o contraseña incorrectos');
    }
    assertCanSignIn(user);

    await authRepository.touchLastLogin(user.schoolId, user.id);
    return createSession(user, meta);
  },

  /**
   * Rotación: cada refresh token sirve una sola vez. Si alguien reutiliza uno
   * ya rotado (fuera de la ventana de gracia), se asume robo y se cierra la familia.
   */
  async refresh(refreshToken, meta) {
    if (!refreshToken) throw AppError.unauthorized('REFRESH_MISSING', 'No hay una sesión iniciada');

    const stored = await authRepository.findRefreshToken(sha256(refreshToken));
    if (!stored) throw AppError.unauthorized('REFRESH_INVALID', 'La sesión no es válida');

    // Revocado a propósito (logout, cuenta deshabilitada...): no es un robo
    if (stored.revokedAt && stored.revokeReason !== 'ROTATED') {
      throw AppError.unauthorized('SESSION_REVOKED', 'La sesión fue cerrada. Inicia sesión de nuevo.');
    }

    if (stored.revokedAt && !stored.inGrace) {
      await authRepository.revokeFamily(stored.schoolId, stored.familyId, 'REUSE_DETECTED');
      logger.warn({ userId: stored.userId, familyId: stored.familyId }, 'Refresh token reutilizado: familia revocada');
      throw AppError.unauthorized('REFRESH_REUSED', 'La sesión se cerró por seguridad. Inicia sesión de nuevo.');
    }

    if (new Date(stored.expiresAt) < new Date()) {
      throw AppError.unauthorized('REFRESH_EXPIRED', 'La sesión expiró. Inicia sesión de nuevo.');
    }

    const user = await authRepository.findSessionUser(stored.schoolId, stored.userId);
    if (!user || user.status !== 'ACTIVE' || user.school.status === 'SUSPENDED') {
      await authRepository.revokeFamily(stored.schoolId, stored.familyId, 'ACCOUNT_DISABLED');
      throw AppError.unauthorized('SESSION_REVOKED', 'Tu sesión ya no es válida.');
    }

    await authRepository.markRotated(stored.schoolId, stored.id);
    return createSession(user, meta, stored.familyId);
  },

  /** Cierra la sesión de este dispositivo (toda la familia del token). */
  async logout(refreshToken) {
    if (!refreshToken) return;
    const stored = await authRepository.findRefreshToken(sha256(refreshToken));
    if (stored) await authRepository.revokeFamily(stored.schoolId, stored.familyId, 'LOGOUT');
  },

  /** Cierra todas las sesiones: invalida refresh tokens y access tokens emitidos. */
  async logoutAll(user) {
    await authRepository.revokeAllForUser(user.schoolId, user.id, 'LOGOUT_ALL');
    await authRepository.bumpTokenVersion(user.schoolId, user.id);
    invalidateSession(user.id);
    emitToUsers([user.id], 'session:revoked', { reason: 'LOGOUT_ALL' });
  },

  async me(user) {
    const sessionUser = await authRepository.findSessionUser(user.schoolId, user.id);
    if (!sessionUser) throw AppError.unauthorized('SESSION_REVOKED', 'Tu sesión ya no es válida.');
    return toSessionUser(sessionUser);
  },
};
