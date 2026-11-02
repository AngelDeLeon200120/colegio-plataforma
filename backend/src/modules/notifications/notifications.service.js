import { emitToUsers } from '../../realtime/emitter.js';
import { notificationsRepository } from './notifications.repository.js';

/** Sincroniza las demás pestañas y dispositivos del usuario. */
async function emitReadState(userId, ids) {
  const count = await notificationsRepository.countUnread(userId);
  emitToUsers([userId], 'notification:read', { ids });
  emitToUsers([userId], 'notification:unread_count', { count });
  return count;
}

export const notificationsService = {
  /**
   * Persiste una notificación por destinatario dentro de la transacción del llamador.
   * Devuelve las creadas para publicarlas con `publish` después del COMMIT.
   */
  async createForUsers(connection, recipientIds, notification) {
    const repo = notificationsRepository.withConnection(connection);
    const created = [];

    for (const recipientId of new Set(recipientIds)) {
      const id = await repo.insert({ ...notification, recipientId });
      if (id) created.push({ ...notification, id, recipientId, readAt: null, createdAt: new Date().toISOString() });
    }
    return created;
  },

  publish(created) {
    for (const { recipientId, dedupeKey, ...notification } of created) {
      emitToUsers([recipientId], 'notification:new', { notification });
    }
  },

  async list(user, { cursor, unread, limit }) {
    const rows = await notificationsRepository.listForRecipient(user.id, { beforeId: cursor, unreadOnly: unread, limit });
    const items = rows.slice(0, limit);
    return {
      items,
      nextCursor: rows.length > limit ? items.at(-1).id : null,
      unreadCount: await notificationsRepository.countUnread(user.id),
    };
  },

  async unreadCount(user) {
    return { count: await notificationsRepository.countUnread(user.id) };
  },

  async markRead(user, ids) {
    const updated = await notificationsRepository.markRead(user.id, ids);
    const count = await emitReadState(user.id, ids);
    return { updated, unreadCount: count };
  },

  async markAllRead(user) {
    const updated = await notificationsRepository.markAllRead(user.id);
    const count = await emitReadState(user.id, 'all');
    return { updated, unreadCount: count };
  },
};
