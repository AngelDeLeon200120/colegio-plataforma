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

async function assertMember(user) {
  if (!(await staffChatRepository.isMember(user))) {
    throw AppError.forbidden('La administración te quitó de la sala de docentes');
  }
}

export const staffChatService = {
  assertMember,

  async messages(user, { before, limit }) {
    const page = await staffChatRepository.listMessages({ beforeId: before, limit });
    const hasMore = page.length > limit;
    const messages = hasMore ? page.slice(1) : page;
    return { messages: await withAttachments(messages), hasMore, canModerate: user.role === 'ADMIN' };
  },

  members: () => staffChatRepository.listMembers(),

  /** También dice si la persona está en la sala (el menú oculta la opción si no). */
  async unreadCount(user) {
    if (!(await staffChatRepository.isMember(user))) return { count: 0, member: false };
    return { count: await staffChatRepository.countUnread(user.id), member: true };
  },

  roster: () => staffChatRepository.listRoster(),

  /**
   * La administración incluye o saca a un docente de la sala. Solo docentes activos del mismo
   * colegio (la administración siempre está). Avisa en vivo a esa persona y a la sala.
   */
  async setMembership(user, userId, included) {
    const teacher = await staffChatRepository.findTeacher(userId);
    if (!teacher) throw AppError.notFound('Docente no encontrado en este colegio');
    if (included) await staffChatRepository.includeMember(teacher.id);
    else await staffChatRepository.removeMember(teacher.id, user.id);

    emitToUsers([teacher.id], 'staffchat:membership', { member: included });
    await broadcast('staffchat:members', { userId: teacher.id, included });
    return { userId: teacher.id, included };
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
