import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { matchesSignature } from '../../core/security/fileSignature.js';
import { emitToRoom } from '../../realtime/emitter.js';
import { rooms } from '../../realtime/rooms.js';
import { filesService } from '../files/files.service.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { feedRepository } from './feed.repository.js';

export const POST_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

// Cualquiera con el muro abierto lo refresca; no se crean notificaciones por publicación
const announce = (user, data) => emitToRoom(rooms.school(user.schoolId), 'feed:changed', { ...data, by: user.id });

const excerpt = (text) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 160 ? `${clean.slice(0, 157)}…` : clean;
};

async function actorName(repo, userId) {
  const actor = await repo.findUserName(userId);
  return actor ? `${actor.firstName} ${actor.lastName}` : 'Alguien';
}

async function loadPost(user, postId) {
  const post = await feedRepository.findPost(user.id, postId);
  if (!post) throw AppError.notFound('Publicación no encontrada');
  return post;
}

async function withComments(posts) {
  const comments = await feedRepository.listRecentComments(posts.map((post) => post.id));
  return posts.map((post) => ({ ...post, comments: comments.filter((comment) => comment.postId === post.id) }));
}

export const feedService = {
  /** Primera página: fijadas + recientes. Siguientes (con cursor): solo recientes. */
  async list(user, { cursor, limit }) {
    const [pinned, page] = await Promise.all([cursor ? [] : feedRepository.listPinned(user.id), feedRepository.listPosts(user.id, { beforeId: cursor, limit })]);
    const hasMore = page.length > limit;
    const posts = page.slice(0, limit);
    return {
      pinned: await withComments(pinned),
      posts: await withComments(posts),
      nextCursor: hasMore ? posts.at(-1).id : null,
      canPublish: user.role === 'ADMIN',
    };
  },

  async create(user, { body, isPinned }, image) {
    if (image && !matchesSignature(image)) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'La imagen no es válida. Usa JPG, PNG, GIF o WEBP.');
    }
    // Disco antes de la transacción (no es transaccional), como en actividades y entregas
    const imageFileId = image ? await filesService.store(user, image, 'POST_IMAGE') : null;

    const id = await withTransaction(async (connection, afterCommit) => {
      const repo = feedRepository.withConnection(connection);
      const postId = await repo.insertPost({ authorId: user.id, body, imageFileId, isPinned });

      // Aviso a toda la comunidad (menos quien publica). Fijada = prioridad alta.
      const recipients = await repo.findAudienceUserIds(user.id);
      const author = await repo.findPost(user.id, postId);
      const preview = body.replace(/\s+/g, ' ').trim();
      const notifications = await notificationsService.createForUsers(connection, recipients, {
        type: 'POST',
        priority: isPinned ? 'HIGH' : 'NORMAL',
        title: `${isPinned ? 'Aviso importante' : 'Nueva publicación'} de ${author.author.firstName} ${author.author.lastName}`.slice(0, 200),
        body: (preview.length > 160 ? `${preview.slice(0, 157)}…` : preview) + (imageFileId ? ' (con imagen)' : ''),
        entityType: 'post',
        entityId: postId,
        actionUrl: `/home?post=${postId}`,
        dedupeKey: `post:${postId}`,
      });
      afterCommit(() => {
        notificationsService.publish(notifications);
        announce(user, { postId, kind: 'created' });
      });
      return postId;
    });
    const [post] = await withComments([await loadPost(user, id)]);
    return post;
  },

  async update(user, postId, changes) {
    await loadPost(user, postId);
    await feedRepository.updatePost(postId, changes);
    announce(user, { postId, kind: 'updated' });
    const [post] = await withComments([await loadPost(user, postId)]);
    return post;
  },

  async remove(user, postId) {
    await loadPost(user, postId);
    await feedRepository.softDeletePost(postId);
    announce(user, { postId, kind: 'deleted' });
  },

  async react(user, postId, on) {
    const current = await loadPost(user, postId);
    await withTransaction(async (connection, afterCommit) => {
      const repo = feedRepository.withConnection(connection);
      const added = await repo.setReaction(postId, user.id, on);
      // Un aviso por persona y publicación: quitar y volver a dar "Me gusta" no lo repite
      const notifications =
        added && current.author.id !== user.id
          ? await notificationsService.createForUsers(connection, [current.author.id], {
              type: 'POST_REACTION',
              priority: 'LOW',
              title: `A ${await actorName(repo, user.id)} le gusta tu publicación`.slice(0, 200),
              body: excerpt(current.body),
              entityType: 'post',
              entityId: postId,
              actionUrl: `/home?post=${postId}`,
              dedupeKey: `post-like:${postId}:${user.id}`,
            })
          : [];
      afterCommit(() => {
        notificationsService.publish(notifications);
        announce(user, { postId, kind: 'reaction' });
      });
    });
    const post = await loadPost(user, postId);
    return { reactionCount: post.reactionCount, reactedByMe: post.reactedByMe };
  },

  async comments(user, postId) {
    await loadPost(user, postId);
    return feedRepository.listComments(postId);
  },

  /** Avisa a quien publicó y a quienes ya comentaron (menos a quien escribe). */
  async comment(user, postId, body) {
    const post = await loadPost(user, postId);
    const id = await withTransaction(async (connection, afterCommit) => {
      const repo = feedRepository.withConnection(connection);
      const commentId = await repo.insertComment({ postId, authorId: user.id, body });
      const commenters = await repo.findCommenterIds(postId);
      const name = await actorName(repo, user.id);
      const base = {
        type: 'POST_COMMENT',
        priority: 'NORMAL',
        body: excerpt(body),
        entityType: 'post',
        entityId: postId,
        actionUrl: `/home?post=${postId}`,
        dedupeKey: `post-comment:${commentId}`,
      };
      const notifications = [];
      if (post.author.id !== user.id) {
        notifications.push(...(await notificationsService.createForUsers(connection, [post.author.id], { ...base, title: `${name} comentó tu publicación`.slice(0, 200) })));
      }
      const others = commenters.filter((commenterId) => commenterId !== user.id && commenterId !== post.author.id);
      notifications.push(
        ...(await notificationsService.createForUsers(connection, others, { ...base, title: `${name} también comentó una publicación que comentaste`.slice(0, 200) })),
      );
      afterCommit(() => {
        notificationsService.publish(notifications);
        announce(user, { postId, kind: 'comment' });
      });
      return commentId;
    });
    return feedRepository.findComment(id);
  },

  /** Quien escribió el comentario o la administración. */
  async removeComment(user, commentId) {
    const comment = await feedRepository.findComment(commentId);
    if (!comment) throw AppError.notFound('Comentario no encontrado');
    if (comment.author.id !== user.id && user.role !== 'ADMIN') throw AppError.forbidden('Solo puedes borrar tus propios comentarios');
    await feedRepository.softDeleteComment(commentId);
    announce(user, { postId: comment.postId, kind: 'comment' });
  },
};
