import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { emitToUsers } from '../../realtime/emitter.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { messagesRepository } from './messages.repository.js';

const STAFF_ROLES = ['TEACHER', 'ADMIN'];

export const TOPIC_LABELS = { TAREAS: 'Tareas', AUSENCIA: 'Ausencia' };
export const REASON_LABELS = {
  LLEGA_TARDE: 'Llega tarde',
  SIN_UNIFORME: 'No llegó con uniforme',
  VACACIONES: 'Está de vacaciones',
  FALLECIMIENTO: 'Fallecimiento',
  ENFERMEDAD: 'Enfermo',
};

const topicLabel = (thread) => (thread.reason ? `${TOPIC_LABELS.AUSENCIA} · ${REASON_LABELS[thread.reason]}` : TOPIC_LABELS[thread.topic]);

// Los avisos a toda una sección son del personal: las familias los leen pero no responden en grupo
const canReply = (user, thread) => thread.scope === 'STUDENT' || STAFF_ROLES.includes(user.role);

/**
 * Avisa a todos los que ven el hilo (menos a quien escribió) dentro de la transacción,
 * y después del COMMIT publica las notificaciones y refresca las bandejas abiertas.
 */
async function notifyMessage(connection, afterCommit, { thread, messageId, author, body }) {
  const repo = messagesRepository.withConnection(connection);
  const staffIds = await repo.findStaffUserIds(thread.sectionId);
  const families = await repo.findFamilyRecipients({ studentId: thread.studentId, sectionId: thread.sectionId });

  const base = {
    type: 'MESSAGE',
    priority: thread.reason === 'FALLECIMIENTO' ? 'HIGH' : 'NORMAL',
    title: `${topicLabel(thread)}: ${thread.subject}`.slice(0, 200),
    body: `${author.firstName}: ${body}`.slice(0, 1000),
    entityType: 'message_thread',
    entityId: thread.id,
    actionUrl: `/messages/${thread.id}`,
    dedupeKey: `message:${messageId}`,
  };

  const notifications = await notificationsService.createForUsers(
    connection,
    staffIds.filter((id) => id !== author.id),
    base,
  );
  for (const { userId, studentId, kind } of families) {
    if (userId === author.id) continue;
    notifications.push(...(await notificationsService.createForUsers(connection, [userId], kind === 'PARENT' ? { ...base, studentId } : base)));
  }

  const audience = [...new Set([author.id, ...staffIds, ...families.map((family) => family.userId)])];
  afterCommit(() => {
    notificationsService.publish(notifications);
    emitToUsers(audience, 'message:new', { threadId: thread.id, messageId });
  });
}

async function loadThread(user, threadId) {
  const thread = await messagesRepository.findVisibleThread(user, threadId);
  if (!thread) throw AppError.notFound('Conversación no encontrada');
  return thread;
}

export const messagesService = {
  async list(user, filters) {
    const [threads, unreadCount] = await Promise.all([messagesRepository.listThreads(user, filters), messagesRepository.countUnreadThreads(user)]);
    return { threads, unreadCount };
  },

  async unreadCount(user) {
    return { count: await messagesRepository.countUnreadThreads(user) };
  },

  async get(user, threadId) {
    const thread = await loadThread(user, threadId);
    const messages = await messagesRepository.listMessages(thread.id);
    await messagesRepository.markRead(thread.id, user.id);
    emitToUsers([user.id], 'message:read', { threadId: thread.id });
    return { thread: { ...thread, canReply: canReply(user, thread) }, messages };
  },

  /** A quién puede escribir esta persona: secciones y estudiantes (personal) o sus estudiantes (familia y estudiante). */
  async recipients(user) {
    if (STAFF_ROLES.includes(user.role)) {
      const sectionIds = user.role === 'TEACHER' ? await messagesRepository.findTeacherSectionIds(user.id) : null;
      const sections = await messagesRepository.listActiveSections(sectionIds);
      const students = await messagesRepository.listStudentsInSections(sections.map((section) => section.id));
      return { canMessageSection: true, sections, students };
    }
    const students = await messagesRepository.listOwnStudents(user);
    return { canMessageSection: false, sections: [], students };
  },

  async create(user, data) {
    let sectionId;
    let studentId = null;

    if (data.scope === 'STUDENT') {
      const student = await messagesRepository.findStudentForUser(user, data.studentId);
      if (!student) throw AppError.notFound('Estudiante no encontrado o sin inscripción activa');
      studentId = student.id;
      sectionId = student.sectionId;
    } else {
      if (!STAFF_ROLES.includes(user.role)) throw AppError.forbidden('Solo el personal del colegio envía avisos a toda una sección');
      const allowed = user.role === 'TEACHER' ? await messagesRepository.findTeacherSectionIds(user.id) : null;
      const [section] = await messagesRepository.listActiveSections([data.sectionId]);
      if (!section || (allowed && !allowed.includes(section.id))) throw AppError.notFound('Sección no encontrada');
      sectionId = section.id;
    }

    const author = await messagesRepository.findAuthor(user.id);
    const threadId = await withTransaction(async (connection, afterCommit) => {
      const repo = messagesRepository.withConnection(connection);
      const id = await repo.createThread({ ...data, studentId, sectionId, createdBy: user.id });
      const messageId = await repo.insertMessage(id, user.id, data.body);
      await repo.markRead(id, user.id);
      const thread = { id, scope: data.scope, topic: data.topic, reason: data.reason, subject: data.subject, studentId, sectionId };
      await notifyMessage(connection, afterCommit, { thread, messageId, author, body: data.body });
      return id;
    });
    return messagesService.get(user, threadId);
  },

  async reply(user, threadId, body) {
    const thread = await loadThread(user, threadId);
    if (!canReply(user, thread)) throw AppError.forbidden('Este aviso es para toda la sección: escribe un mensaje nuevo sobre tu estudiante');

    const author = await messagesRepository.findAuthor(user.id);
    const message = await withTransaction(async (connection, afterCommit) => {
      const repo = messagesRepository.withConnection(connection);
      const messageId = await repo.insertMessage(thread.id, user.id, body);
      await repo.markRead(thread.id, user.id);
      await notifyMessage(connection, afterCommit, {
        thread: { ...thread, studentId: thread.student?.id ?? null, sectionId: thread.section.id },
        messageId,
        author,
        body,
      });
      return { id: messageId, body, createdAt: new Date().toISOString(), author: { id: user.id, ...author, role: user.role } };
    });
    return message;
  },
};
