import { AppError } from '../../core/errors/AppError.js';
import { emitToUsers } from '../../realtime/emitter.js';
import { staffChatRepository } from './staffchat.repository.js';

// Solo al personal del colegio: las familias y estudiantes nunca reciben estos eventos
async function broadcast(type, data) {
  const members = await staffChatRepository.listMembers();
  emitToUsers(
    members.map((member) => member.id),
    type,
    data,
  );
}

export const staffChatService = {
  async messages(user, { before, limit }) {
    const page = await staffChatRepository.listMessages({ beforeId: before, limit });
    const hasMore = page.length > limit;
    const messages = hasMore ? page.slice(1) : page;
    return { messages, hasMore, canModerate: user.role === 'ADMIN' };
  },

  members: () => staffChatRepository.listMembers(),

  async unreadCount(user) {
    return { count: await staffChatRepository.countUnread(user.id) };
  },

  async send(user, body) {
    const id = await staffChatRepository.insertMessage(user.id, body);
    const message = await staffChatRepository.findMessage(id);
    await staffChatRepository.markRead(user.id, id);
    await broadcast('staffchat:new', { message });
    return message;
  },

  /** Quien lo escribió o la administración. Queda como "mensaje eliminado". */
  async remove(user, messageId) {
    const message = await staffChatRepository.findMessage(messageId);
    if (!message) throw AppError.notFound('Mensaje no encontrado');
    if (message.author.id !== user.id && user.role !== 'ADMIN') throw AppError.forbidden('Solo puedes borrar tus propios mensajes');
    await staffChatRepository.softDelete(messageId, user.id);
    await broadcast('staffchat:deleted', { messageId });
  },

  async markRead(user, messageId) {
    await staffChatRepository.markRead(user.id, messageId);
    // Sincroniza el contador en las demás pestañas de la misma persona
    emitToUsers([user.id], 'staffchat:read', { messageId });
    return { count: await staffChatRepository.countUnread(user.id) };
  },
};
