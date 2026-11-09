import { AppError } from '../../core/errors/AppError.js';
import { matchesSignature } from '../../core/security/fileSignature.js';
import { emitToRoom } from '../../realtime/emitter.js';
import { rooms } from '../../realtime/rooms.js';
import { filesService } from '../files/files.service.js';
import { feedRepository } from './feed.repository.js';

export const POST_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

// Cualquiera con el muro abierto lo refresca; no se crean notificaciones por publicación
const announce = (user, data) => emitToRoom(rooms.school(user.schoolId), 'feed:changed', { ...data, by: user.id });

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
    const imageFileId = image ? await filesService.store(user, image, 'POST_IMAGE') : null;
    const id = await feedRepository.insertPost({ authorId: user.id, body, imageFileId, isPinned });
    announce(user, { postId: id, kind: 'created' });
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
    await loadPost(user, postId);
    await feedRepository.setReaction(postId, user.id, on);
    const post = await loadPost(user, postId);
    announce(user, { postId, kind: 'reaction' });
    return { reactionCount: post.reactionCount, reactedByMe: post.reactedByMe };
  },

  async comments(user, postId) {
    await loadPost(user, postId);
    return feedRepository.listComments(postId);
  },

  async comment(user, postId, body) {
    await loadPost(user, postId);
    const id = await feedRepository.insertComment({ postId, authorId: user.id, body });
    announce(user, { postId, kind: 'comment' });
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
