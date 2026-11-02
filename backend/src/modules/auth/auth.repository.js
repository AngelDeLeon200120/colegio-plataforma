import { BaseRepository } from '../../core/db/BaseRepository.js';

// Login y refresh ocurren ANTES de conocer el tenant, por eso estas consultas
// reciben school_id explícito (sale de la fila de usuario o del refresh token)
// en lugar de leerlo del contexto.

const USER_COLUMNS = `
  u.id, u.school_id, u.email, u.first_name, u.last_name, u.role, u.status, u.token_version,
  s.name AS school_name, s.slug AS school_slug, s.timezone AS school_timezone, s.status AS school_status`;

const toUser = (row) =>
  row && {
    id: row.id,
    schoolId: row.school_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    status: row.status,
    tokenVersion: row.token_version,
    passwordHash: row.password_hash,
    school: { id: row.school_id, name: row.school_name, slug: row.school_slug, timezone: row.school_timezone, status: row.school_status },
  };

class AuthRepository extends BaseRepository {
  async findLoginCandidate(schoolSlug, email) {
    const row = await this.one(
      `SELECT ${USER_COLUMNS}, u.password_hash
         FROM users u
         JOIN schools s ON s.id = u.school_id
        WHERE s.slug = ? AND u.email = ? AND u.deleted_at IS NULL`,
      [schoolSlug, email],
    );
    return toUser(row);
  }

  async findSessionUser(schoolId, userId) {
    const row = await this.one(
      `SELECT ${USER_COLUMNS}
         FROM users u
         JOIN schools s ON s.id = u.school_id
        WHERE u.school_id = ? AND u.id = ? AND u.deleted_at IS NULL`,
      [schoolId, userId],
    );
    return toUser(row);
  }

  async findChildren(schoolId, guardianId) {
    const rows = await this.query(
      `SELECT st.id, st.student_code, st.first_name, st.last_name
         FROM guardian_students gs
         JOIN students st ON st.school_id = gs.school_id AND st.id = gs.student_id
        WHERE gs.school_id = ? AND gs.guardian_id = ? AND st.status = 'ACTIVE'
        ORDER BY st.first_name`,
      [schoolId, guardianId],
    );
    return rows.map((row) => ({ id: row.id, code: row.student_code, firstName: row.first_name, lastName: row.last_name }));
  }

  async touchLastLogin(schoolId, userId) {
    await this.query('UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE school_id = ? AND id = ?', [schoolId, userId]);
  }

  async bumpTokenVersion(schoolId, userId) {
    await this.query('UPDATE users SET token_version = token_version + 1 WHERE school_id = ? AND id = ?', [schoolId, userId]);
  }

  async insertRefreshToken({ schoolId, userId, tokenHash, familyId, expiresAt, ip, userAgent }) {
    await this.query(
      `INSERT INTO refresh_tokens (school_id, user_id, token_hash, family_id, expires_at, created_ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [schoolId, userId, tokenHash, familyId, expiresAt, ip, userAgent],
    );
  }

  /**
   * `inGrace`: rotado hace menos de 10 s (dos pestañas renovando a la vez).
   * Un token revocado por logout o por seguridad nunca tiene gracia.
   */
  async findRefreshToken(tokenHash) {
    const row = await this.one(
      `SELECT rt.id, rt.school_id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at, rt.revoke_reason,
              rt.revoke_reason = 'ROTATED' AND rt.revoked_at >= UTC_TIMESTAMP() - INTERVAL 10 SECOND AS in_grace
         FROM refresh_tokens rt
        WHERE rt.token_hash = ?`,
      [tokenHash],
    );
    return (
      row && {
        id: row.id,
        schoolId: row.school_id,
        userId: row.user_id,
        familyId: row.family_id,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        revokeReason: row.revoke_reason,
        inGrace: Boolean(row.in_grace),
      }
    );
  }

  async markRotated(schoolId, tokenId) {
    await this.query(
      `UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(), revoke_reason = 'ROTATED'
        WHERE school_id = ? AND id = ? AND revoked_at IS NULL`,
      [schoolId, tokenId],
    );
  }

  /**
   * Revoca toda la familia, incluidos los tokens ya rotados: así ninguno conserva
   * la ventana de gracia después de un logout o de detectar un robo.
   */
  async revokeFamily(schoolId, familyId, reason) {
    await this.query(
      `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP()), revoke_reason = ?
        WHERE school_id = ? AND family_id = ?`,
      [reason, schoolId, familyId],
    );
  }

  async revokeAllForUser(schoolId, userId, reason) {
    await this.query(
      `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP()), revoke_reason = ?
        WHERE school_id = ? AND user_id = ? AND (revoked_at IS NULL OR revoke_reason = 'ROTATED')`,
      [reason, schoolId, userId],
    );
  }
}

export const authRepository = new AuthRepository();
