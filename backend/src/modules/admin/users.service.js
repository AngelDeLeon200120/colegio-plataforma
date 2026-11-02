import { AppError } from '../../core/errors/AppError.js';
import { generateTemporaryPassword, hashPassword, verifyPassword } from '../../core/security/password.js';
import { invalidateSession } from '../../core/security/sessionGuard.js';
import { emitToUsers } from '../../realtime/emitter.js';
import { adminUsersRepository } from './users.repository.js';

/** El email es único por colegio: un duplicado se explica, no se responde "registro existente". */
export async function withEmailCheck(work) {
  try {
    return await work();
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' && String(err.sqlMessage).includes('uq_users_email')) {
      throw AppError.conflict('EMAIL_TAKEN', 'Ya existe un usuario con ese correo en el colegio');
    }
    throw err;
  }
}

/**
 * Crea una cuenta con contraseña temporal (se muestra una sola vez a la administración).
 * `repo` permite hacerlo dentro de una transacción. Devuelve { id, temporaryPassword }.
 */
export async function createAccount({ role, email, firstName, lastName, phone }, repo = adminUsersRepository) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const id = await withEmailCheck(() => repo.insert({ role, email, firstName, lastName, phone, passwordHash }));
  return { id, temporaryPassword };
}

async function endSessions(userId, reason) {
  await adminUsersRepository.endSessions(userId, reason);
  invalidateSession(userId);
  emitToUsers([userId], 'session:revoked', { reason });
}

export const adminUsersService = {
  async list({ role, q }) {
    const [users, children, courseCounts] = await Promise.all([
      adminUsersRepository.list({ role, q }),
      adminUsersRepository.childrenByGuardian(),
      adminUsersRepository.courseCountByTeacher(),
    ]);
    return users.map((user) => ({
      ...user,
      ...(user.role === 'PARENT' && { children: children.get(user.id) ?? [] }),
      ...(user.role === 'TEACHER' && { courseCount: courseCounts.get(user.id) ?? 0 }),
    }));
  },

  async create(data) {
    const { id, temporaryPassword } = await createAccount(data);
    return { user: await adminUsersRepository.findById(id), temporaryPassword };
  },

  async update(admin, userId, changes) {
    const user = await adminUsersRepository.findById(userId);
    if (!user || user.role === 'STUDENT') throw AppError.notFound('Usuario no encontrado');
    if (userId === admin.id && changes.status === 'DISABLED') {
      throw AppError.unprocessable('SELF_DISABLE', 'No puedes deshabilitar tu propia cuenta');
    }

    await withEmailCheck(() => adminUsersRepository.update(userId, changes));
    if (changes.status === 'DISABLED' && user.status !== 'DISABLED') await endSessions(userId, 'ACCOUNT_DISABLED');
    return adminUsersRepository.findById(userId);
  },

  /** Nueva contraseña temporal; cierra todas las sesiones abiertas del usuario. */
  async resetPassword(userId) {
    const user = await adminUsersRepository.findById(userId);
    if (!user) throw AppError.notFound('Usuario no encontrado');

    const temporaryPassword = generateTemporaryPassword();
    await adminUsersRepository.setPassword(userId, await hashPassword(temporaryPassword));
    await endSessions(userId, 'LOGOUT_ALL');
    return { temporaryPassword };
  },

  /** Cada usuario cambia la suya (sin cerrar la sesión actual). */
  async changeOwnPassword(user, { currentPassword, newPassword }) {
    const hash = await adminUsersRepository.findPasswordHash(user.id);
    if (!hash || !(await verifyPassword(currentPassword, hash))) {
      throw AppError.unprocessable('WRONG_PASSWORD', 'La contraseña actual no es correcta', [{ field: 'currentPassword', issue: 'Incorrecta' }]);
    }
    await adminUsersRepository.setPassword(user.id, await hashPassword(newPassword));
  },
};
