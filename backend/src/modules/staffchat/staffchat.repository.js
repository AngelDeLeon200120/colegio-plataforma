import { BaseRepository } from '../../core/db/BaseRepository.js';

const toMessage = (row) => ({
  id: row.id,
  body: row.deleted_at ? null : row.body,
  deleted: Boolean(row.deleted_at),
  createdAt: row.created_at,
  author: { id: row.author_id, firstName: row.first_name, lastName: row.last_name, role: row.role },
});

const MESSAGE_SELECT = `
  SELECT m.id, m.body, m.created_at, m.deleted_at, u.id AS author_id, u.first_name, u.last_name, u.role
    FROM staff_chat_messages m
    JOIN users u ON u.school_id = m.school_id AND u.id = m.author_id`;

class StaffChatRepository extends BaseRepository {
  /** Los últimos mensajes (o los anteriores a `beforeId`), en orden cronológico. */
  async listMessages({ beforeId, limit }) {
    const rows = await this.query(
      `${MESSAGE_SELECT}
        WHERE m.school_id = ? ${beforeId ? 'AND m.id < ?' : ''}
        ORDER BY m.id DESC
        LIMIT ${Number(limit) + 1}`,
      beforeId ? [this.schoolId, beforeId] : [this.schoolId],
    );
    return rows.map(toMessage).reverse();
  }

  async findMessage(messageId) {
    const row = await this.one(`${MESSAGE_SELECT} WHERE m.school_id = ? AND m.id = ?`, [this.schoolId, messageId]);
    return row && toMessage(row);
  }

  /** Adjuntos de varios mensajes: { messageId: [{ id, name, mimeType, size }] }. Los de mensajes eliminados no se devuelven. */
  async listAttachments(messageIds) {
    if (!messageIds.length) return {};
    const rows = await this.query(
      `SELECT sca.message_id, f.id, f.original_name, f.mime_type, f.size_bytes
         FROM staff_chat_attachments sca
         JOIN files f ON f.school_id = sca.school_id AND f.id = sca.file_id AND f.deleted_at IS NULL
        WHERE sca.school_id = ? AND sca.message_id IN (${messageIds.map(() => '?').join(', ')})
        ORDER BY sca.message_id, sca.sort_order`,
      [this.schoolId, ...messageIds],
    );
    const byMessage = {};
    for (const row of rows) {
      (byMessage[row.message_id] ??= []).push({ id: row.id, name: row.original_name, mimeType: row.mime_type, size: row.size_bytes });
    }
    return byMessage;
  }

  async insertAttachments(messageId, fileIds) {
    for (const [index, fileId] of fileIds.entries()) {
      await this.query('INSERT INTO staff_chat_attachments (school_id, message_id, file_id, sort_order) VALUES (?, ?, ?, ?)', [
        this.schoolId,
        messageId,
        fileId,
        index,
      ]);
    }
  }

  async insertMessage(authorId, body) {
    const result = await this.query('INSERT INTO staff_chat_messages (school_id, author_id, body) VALUES (?, ?, ?)', [this.schoolId, authorId, body]);
    return result.insertId;
  }

  async softDelete(messageId, deletedBy) {
    await this.query('UPDATE staff_chat_messages SET deleted_at = UTC_TIMESTAMP(), deleted_by = ? WHERE school_id = ? AND id = ? AND deleted_at IS NULL', [
      deletedBy,
      this.schoolId,
      messageId,
    ]);
  }

  /** Miembros de la sala: la administración y los docentes activos que no fueron sacados. */
  async listMembers() {
    const rows = await this.query(
      `SELECT u.id, u.first_name, u.last_name, u.role FROM users u
        WHERE u.school_id = ? AND u.role IN ('ADMIN', 'TEACHER') AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM staff_chat_removed r WHERE r.school_id = u.school_id AND r.user_id = u.id)
        ORDER BY FIELD(u.role, 'ADMIN', 'TEACHER'), u.first_name, u.last_name`,
      [this.schoolId],
    );
    return rows.map((row) => ({ id: row.id, firstName: row.first_name, lastName: row.last_name, role: row.role }));
  }

  /** ¿Está en la sala? La administración siempre; un docente, si no lo sacaron. */
  async isMember(user) {
    if (user.role === 'ADMIN') return true;
    if (user.role !== 'TEACHER') return false;
    const row = await this.one('SELECT 1 AS removed FROM staff_chat_removed WHERE school_id = ? AND user_id = ?', [this.schoolId, user.id]);
    return !row;
  }

  /** Para la administración: todo el personal activo del colegio y si está en la sala. */
  async listRoster() {
    const rows = await this.query(
      `SELECT u.id, u.first_name, u.last_name, u.role, r.removed_at, rb.first_name AS by_first, rb.last_name AS by_last
         FROM users u
         LEFT JOIN staff_chat_removed r ON r.school_id = u.school_id AND r.user_id = u.id
         LEFT JOIN users rb             ON rb.school_id = r.school_id AND rb.id = r.removed_by
        WHERE u.school_id = ? AND u.role IN ('ADMIN', 'TEACHER') AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
        ORDER BY FIELD(u.role, 'ADMIN', 'TEACHER'), u.first_name, u.last_name`,
      [this.schoolId],
    );
    return rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      included: !row.removed_at,
      removedAt: row.removed_at,
      removedBy: row.by_first ? `${row.by_first} ${row.by_last}` : null,
    }));
  }

  /** Docente activo de este colegio (el filtro por school_id impide tocar a alguien de otro colegio). */
  async findTeacher(userId) {
    const row = await this.one(
      `SELECT id, first_name, last_name FROM users
        WHERE school_id = ? AND id = ? AND role = 'TEACHER' AND status = 'ACTIVE' AND deleted_at IS NULL`,
      [this.schoolId, userId],
    );
    return row && { id: row.id, firstName: row.first_name, lastName: row.last_name };
  }

  async removeMember(userId, removedBy) {
    await this.query('INSERT IGNORE INTO staff_chat_removed (school_id, user_id, removed_by) VALUES (?, ?, ?)', [this.schoolId, userId, removedBy]);
  }

  async includeMember(userId) {
    await this.query('DELETE FROM staff_chat_removed WHERE school_id = ? AND user_id = ?', [this.schoolId, userId]);
  }

  /** Mensajes de otras personas posteriores a lo último que leyó. */
  async countUnread(userId) {
    const row = await this.one(
      `SELECT COUNT(*) AS total FROM staff_chat_messages m
        WHERE m.school_id = ? AND m.author_id <> ? AND m.deleted_at IS NULL
          AND m.id > COALESCE((SELECT r.last_read_message_id FROM staff_chat_reads r WHERE r.school_id = m.school_id AND r.user_id = ?), 0)`,
      [this.schoolId, userId, userId],
    );
    return Number(row.total);
  }

  /** Solo avanza (leer en otra pestaña no hace retroceder el marcador). */
  async markRead(userId, messageId) {
    await this.query(
      `INSERT INTO staff_chat_reads (school_id, user_id, last_read_message_id) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id))`,
      [this.schoolId, userId, messageId],
    );
  }
}

export const staffChatRepository = new StaffChatRepository();
