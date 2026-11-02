import { BaseRepository } from '../../core/db/BaseRepository.js';

const UPDATABLE = { firstName: 'first_name', lastName: 'last_name', email: 'email', phone: 'phone', status: 'status' };

const toUser = (row) => ({
  id: row.id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  phone: row.phone,
  role: row.role,
  status: row.status,
  lastLoginAt: row.last_login_at,
});

class AdminUsersRepository extends BaseRepository {
  async list({ role, q }) {
    const params = [this.schoolId];
    let filters = '';
    if (role) {
      filters += ' AND role = ?';
      params.push(role);
    }
    if (q) {
      filters += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    // Las cuentas de estudiantes se gestionan desde su expediente
    const rows = await this.query(
      `SELECT id, email, first_name, last_name, phone, role, status, last_login_at FROM users
        WHERE school_id = ? AND deleted_at IS NULL AND role <> 'STUDENT' ${filters}
        ORDER BY last_name, first_name LIMIT 500`,
      params,
    );
    return rows.map(toUser);
  }

  async findById(userId) {
    const row = await this.one(
      'SELECT id, email, first_name, last_name, phone, role, status, last_login_at FROM users WHERE school_id = ? AND id = ? AND deleted_at IS NULL',
      [this.schoolId, userId],
    );
    return row && toUser(row);
  }

  /** Hijos e hijas de cada familia (para la lista de usuarios). */
  async childrenByGuardian() {
    const rows = await this.query(
      `SELECT gs.guardian_id, st.id, st.first_name, st.last_name
         FROM guardian_students gs
         JOIN students st ON st.school_id = gs.school_id AND st.id = gs.student_id
        WHERE gs.school_id = ?
        ORDER BY st.first_name`,
      [this.schoolId],
    );
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.guardian_id)) map.set(row.guardian_id, []);
      map.get(row.guardian_id).push({ id: row.id, name: `${row.first_name} ${row.last_name}` });
    }
    return map;
  }

  async courseCountByTeacher() {
    const rows = await this.query(
      'SELECT teacher_id, COUNT(*) AS total FROM courses WHERE school_id = ? AND is_active = 1 GROUP BY teacher_id',
      [this.schoolId],
    );
    return new Map(rows.map((row) => [row.teacher_id, Number(row.total)]));
  }

  async insert({ role, email, firstName, lastName, phone, passwordHash }) {
    const result = await this.query(
      `INSERT INTO users (school_id, email, password_hash, first_name, last_name, phone, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [this.schoolId, email, passwordHash, firstName, lastName, phone ?? null, role],
    );
    return result.insertId;
  }

  async update(userId, fields) {
    const entries = Object.entries(fields).filter(([key, value]) => UPDATABLE[key] && value !== undefined);
    if (!entries.length) return;
    await this.query(`UPDATE users SET ${entries.map(([key]) => `${UPDATABLE[key]} = ?`).join(', ')} WHERE school_id = ? AND id = ?`, [
      ...entries.map(([, value]) => value),
      this.schoolId,
      userId,
    ]);
  }

  /** Invalida todas las sesiones del usuario (tokens de acceso y de renovación). */
  async endSessions(userId, reason) {
    await this.query('UPDATE users SET token_version = token_version + 1 WHERE school_id = ? AND id = ?', [this.schoolId, userId]);
    await this.query(
      `UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP()), revoke_reason = ?
        WHERE school_id = ? AND user_id = ? AND (revoked_at IS NULL OR revoke_reason = 'ROTATED')`,
      [reason, this.schoolId, userId],
    );
  }

  async setPassword(userId, passwordHash) {
    await this.query('UPDATE users SET password_hash = ? WHERE school_id = ? AND id = ?', [passwordHash, this.schoolId, userId]);
  }

  async findPasswordHash(userId) {
    const row = await this.one('SELECT password_hash FROM users WHERE school_id = ? AND id = ?', [this.schoolId, userId]);
    return row?.password_hash ?? null;
  }
}

export const adminUsersRepository = new AdminUsersRepository();
