import { BaseRepository } from '../../core/db/BaseRepository.js';

class NotificationsRepository extends BaseRepository {
  /** Devuelve el id insertado, o null si dedupe_key ya existía para ese destinatario. */
  async insert(notification) {
    try {
      const result = await this.query(
        `INSERT INTO notifications
           (school_id, recipient_id, type, priority, title, body, entity_type, entity_id,
            student_id, action_url, data, dedupe_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.schoolId,
          notification.recipientId,
          notification.type,
          notification.priority,
          notification.title,
          notification.body ?? null,
          notification.entityType ?? null,
          notification.entityId ?? null,
          notification.studentId ?? null,
          notification.actionUrl ?? null,
          notification.data ? JSON.stringify(notification.data) : null,
          notification.dedupeKey ?? null,
        ],
      );
      return result.insertId;
    } catch (err) {
      // InnoDB solo revierte esta sentencia; la transacción sigue viva
      if (err.code === 'ER_DUP_ENTRY') return null;
      throw err;
    }
  }

  /**
   * Bandeja paginada por cursor (id descendente, índice ix_notifications_inbox).
   * Trae una fila de más para saber si hay otra página.
   */
  async listForRecipient(recipientId, { beforeId, unreadOnly, limit }) {
    const params = [this.schoolId, recipientId];
    if (beforeId) params.push(beforeId);

    const rows = await this.query(
      `SELECT n.id, n.type, n.priority, n.title, n.body, n.entity_type, n.entity_id, n.student_id,
              n.action_url, n.data, n.read_at, n.created_at, st.first_name AS student_first_name
         FROM notifications n
         LEFT JOIN students st ON st.school_id = n.school_id AND st.id = n.student_id
        WHERE n.school_id = ? AND n.recipient_id = ?
          ${beforeId ? 'AND n.id < ?' : ''}
          ${unreadOnly ? 'AND n.read_at IS NULL' : ''}
        ORDER BY n.id DESC
        LIMIT ${Number(limit) + 1}`,
      params,
    );
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      priority: row.priority,
      title: row.title,
      body: row.body,
      entityType: row.entity_type,
      entityId: row.entity_id,
      studentId: row.student_id,
      studentName: row.student_first_name,
      actionUrl: row.action_url,
      data: row.data,
      readAt: row.read_at,
      createdAt: row.created_at,
    }));
  }

  async countUnread(recipientId) {
    const row = await this.one(
      'SELECT COUNT(*) AS total FROM notifications WHERE school_id = ? AND recipient_id = ? AND read_at IS NULL',
      [this.schoolId, recipientId],
    );
    return Number(row.total);
  }

  /** Solo marca las del propio destinatario: ids ajenos se ignoran sin error. */
  async markRead(recipientId, ids) {
    const result = await this.query(
      `UPDATE notifications SET read_at = UTC_TIMESTAMP()
        WHERE school_id = ? AND recipient_id = ? AND read_at IS NULL AND id IN (${ids.map(() => '?').join(', ')})`,
      [this.schoolId, recipientId, ...ids],
    );
    return result.affectedRows;
  }

  async markAllRead(recipientId) {
    const result = await this.query(
      'UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE school_id = ? AND recipient_id = ? AND read_at IS NULL',
      [this.schoolId, recipientId],
    );
    return result.affectedRows;
  }
}

export const notificationsRepository = new NotificationsRepository();
