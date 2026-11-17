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

  /** Administración y docentes activos del colegio: los miembros de la sala. */
  async listMembers() {
    const rows = await this.query(
      `SELECT id, first_name, last_name, role FROM users
        WHERE school_id = ? AND role IN ('ADMIN', 'TEACHER') AND status = 'ACTIVE' AND deleted_at IS NULL
        ORDER BY FIELD(role, 'ADMIN', 'TEACHER'), first_name, last_name`,
      [this.schoolId],
    );
    return rows.map((row) => ({ id: row.id, firstName: row.first_name, lastName: row.last_name, role: row.role }));
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
