import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { matchesSignature } from '../../core/security/fileSignature.js';
import { filesService } from '../files/files.service.js';
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

/** Agrega a cada mensaje sus adjuntos (los eliminados no muestran nada). */
async function withAttachments(messages) {
  const visible = messages.filter((message) => !message.deleted).map((message) => message.id);
  const attachments = await staffChatRepository.listAttachments(visible);
  return messages.map((message) => ({ ...message, attachments: message.deleted ? [] : (attachments[message.id] ?? []) }));
}

export const staffChatService = {
  async messages(user, { before, limit }) {
    const page = await staffChatRepository.listMessages({ beforeId: before, limit });
    const hasMore = page.length > limit;
    const messages = hasMore ? page.slice(1) : page;
    return { messages: await withAttachments(messages), hasMore, canModerate: user.role === 'ADMIN' };
  },

  members: () => staffChatRepository.listMembers(),

  async unreadCount(user) {
    return { count: await staffChatRepository.countUnread(user.id) };
  },

  /** Texto, adjuntos (fotos, videos, documentos) o ambos. */
  async send(user, body, files = []) {
    if (!body && !files.length) throw AppError.validation([{ field: 'body', issue: 'Escribe un mensaje o adjunta un archivo' }]);
    const invalid = files.filter((file) => !matchesSignature(file));
    if (invalid.length) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', `El contenido no coincide con su extensión: ${invalid.map((file) => file.originalname).join(', ')}`);
    }
    // Disco antes de la transacción (no es transaccional), como en el resto de archivos
    const fileIds = [];
    for (const file of files) fileIds.push(await filesService.store(user, file, 'STAFF_CHAT'));

    const id = await withTransaction(async (connection) => {
      const repo = staffChatRepository.withConnection(connection);
      const messageId = await repo.insertMessage(user.id, body ?? '');
      await repo.insertAttachments(messageId, fileIds);
      return messageId;
    });
    const [message] = await withAttachments([await staffChatRepository.findMessage(id)]);
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
