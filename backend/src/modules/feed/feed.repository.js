import { BaseRepository } from '../../core/db/BaseRepository.js';

const PREVIEW_COMMENTS = 3;

const POST_COLUMNS = `
  p.id, p.body, p.is_pinned, p.created_at, p.image_file_id,
  f.original_name AS image_name, f.mime_type AS image_mime,
  u.id AS author_id, u.first_name, u.last_name, u.role,
  (SELECT COUNT(*) FROM post_reactions r WHERE r.school_id = p.school_id AND r.post_id = p.id) AS reaction_count,
  EXISTS (SELECT 1 FROM post_reactions r WHERE r.school_id = p.school_id AND r.post_id = p.id AND r.user_id = ?) AS reacted,
  (SELECT COUNT(*) FROM post_comments pc WHERE pc.school_id = p.school_id AND pc.post_id = p.id AND pc.deleted_at IS NULL) AS comment_count`;

const POST_JOINS = `
  FROM posts p
  JOIN users u      ON u.school_id = p.school_id AND u.id = p.author_id
  LEFT JOIN files f ON f.school_id = p.school_id AND f.id = p.image_file_id AND f.deleted_at IS NULL`;

const toPost = (row) => ({
  id: row.id,
  body: row.body,
  isPinned: Boolean(row.is_pinned),
  createdAt: row.created_at,
  image: row.image_file_id && row.image_name ? { id: row.image_file_id, name: row.image_name, mimeType: row.image_mime } : null,
  author: { id: row.author_id, firstName: row.first_name, lastName: row.last_name, role: row.role },
  reactionCount: Number(row.reaction_count),
  reactedByMe: Boolean(row.reacted),
  commentCount: Number(row.comment_count),
});

const toComment = (row) => ({
  id: row.id,
  postId: row.post_id,
  body: row.body,
  createdAt: row.created_at,
  author: { id: row.author_id, firstName: row.first_name, lastName: row.last_name, role: row.role },
});

const COMMENT_COLUMNS = 'pc.id, pc.post_id, pc.body, pc.created_at, u.id AS author_id, u.first_name, u.last_name, u.role';

class FeedRepository extends BaseRepository {
  async listPinned(userId) {
    const rows = await this.query(
      `SELECT ${POST_COLUMNS} ${POST_JOINS}
        WHERE p.school_id = ? AND p.deleted_at IS NULL AND p.is_pinned = 1
        ORDER BY p.id DESC LIMIT 10`,
      [userId, this.schoolId],
    );
    return rows.map(toPost);
  }

  /** Publicaciones no fijadas, de la más reciente a la más antigua, por cursor de id. */
  async listPosts(userId, { beforeId, limit }) {
    const rows = await this.query(
      `SELECT ${POST_COLUMNS} ${POST_JOINS}
        WHERE p.school_id = ? AND p.deleted_at IS NULL AND p.is_pinned = 0 ${beforeId ? 'AND p.id < ?' : ''}
        ORDER BY p.id DESC LIMIT ${Number(limit) + 1}`,
      beforeId ? [userId, this.schoolId, beforeId] : [userId, this.schoolId],
    );
    return rows.map(toPost);
  }

  async findPost(userId, postId) {
    const row = await this.one(`SELECT ${POST_COLUMNS} ${POST_JOINS} WHERE p.school_id = ? AND p.id = ? AND p.deleted_at IS NULL`, [
      userId,
      this.schoolId,
      postId,
    ]);
    return row && toPost(row);
  }

  /** Los últimos comentarios de cada publicación (para la vista previa del muro). */
  async listRecentComments(postIds) {
    if (!postIds.length) return [];
    const rows = await this.query(
      `SELECT * FROM (
         SELECT ${COMMENT_COLUMNS}, ROW_NUMBER() OVER (PARTITION BY pc.post_id ORDER BY pc.id DESC) AS position
           FROM post_comments pc
           JOIN users u ON u.school_id = pc.school_id AND u.id = pc.author_id
          WHERE pc.school_id = ? AND pc.deleted_at IS NULL AND pc.post_id IN (${postIds.map(() => '?').join(', ')})
       ) recent
       WHERE recent.position <= ${PREVIEW_COMMENTS}
       ORDER BY recent.id`,
      [this.schoolId, ...postIds],
    );
    return rows.map(toComment);
  }

  async listComments(postId) {
    const rows = await this.query(
      `SELECT ${COMMENT_COLUMNS}
         FROM post_comments pc
         JOIN users u ON u.school_id = pc.school_id AND u.id = pc.author_id
        WHERE pc.school_id = ? AND pc.post_id = ? AND pc.deleted_at IS NULL
        ORDER BY pc.id
        LIMIT 500`,
      [this.schoolId, postId],
    );
    return rows.map(toComment);
  }

  async findComment(commentId) {
    const row = await this.one(
      `SELECT ${COMMENT_COLUMNS}
         FROM post_comments pc
         JOIN users u ON u.school_id = pc.school_id AND u.id = pc.author_id
         JOIN posts p ON p.school_id = pc.school_id AND p.id = pc.post_id AND p.deleted_at IS NULL
        WHERE pc.school_id = ? AND pc.id = ? AND pc.deleted_at IS NULL`,
      [this.schoolId, commentId],
    );
    return row && toComment(row);
  }

  /** Toda la comunidad con acceso activo: a quienes avisa una publicación nueva. */
  async findAudienceUserIds(excludeUserId) {
    const rows = await this.query(
      `SELECT id FROM users WHERE school_id = ? AND status = 'ACTIVE' AND deleted_at IS NULL AND id <> ?`,
      [this.schoolId, excludeUserId],
    );
    return rows.map((row) => row.id);
  }

  async insertPost({ authorId, body, imageFileId, isPinned }) {
    const result = await this.query(
      'INSERT INTO posts (school_id, author_id, body, image_file_id, is_pinned) VALUES (?, ?, ?, ?, ?)',
      [this.schoolId, authorId, body, imageFileId ?? null, isPinned ? 1 : 0],
    );
    return result.insertId;
  }

  async updatePost(postId, { body, isPinned }) {
    const sets = [];
    const params = [];
    if (body !== undefined) {
      sets.push('body = ?');
      params.push(body);
    }
    if (isPinned !== undefined) {
      sets.push('is_pinned = ?');
      params.push(isPinned ? 1 : 0);
    }
    if (!sets.length) return;
    await this.query(`UPDATE posts SET ${sets.join(', ')} WHERE school_id = ? AND id = ? AND deleted_at IS NULL`, [
      ...params,
      this.schoolId,
      postId,
    ]);
  }

  /** Borrado lógico: comentarios y reacciones quedan, pero la publicación ya no se muestra. */
  async softDeletePost(postId) {
    await this.query('UPDATE posts SET deleted_at = UTC_TIMESTAMP() WHERE school_id = ? AND id = ? AND deleted_at IS NULL', [this.schoolId, postId]);
  }

  async setReaction(postId, userId, on) {
    if (on) {
      await this.query('INSERT IGNORE INTO post_reactions (school_id, post_id, user_id) VALUES (?, ?, ?)', [this.schoolId, postId, userId]);
    } else {
      await this.query('DELETE FROM post_reactions WHERE school_id = ? AND post_id = ? AND user_id = ?', [this.schoolId, postId, userId]);
    }
  }

  async insertComment({ postId, authorId, body }) {
    const result = await this.query('INSERT INTO post_comments (school_id, post_id, author_id, body) VALUES (?, ?, ?, ?)', [
      this.schoolId,
      postId,
      authorId,
      body,
    ]);
    return result.insertId;
  }

  async softDeleteComment(commentId) {
    await this.query('UPDATE post_comments SET deleted_at = UTC_TIMESTAMP() WHERE school_id = ? AND id = ? AND deleted_at IS NULL', [
      this.schoolId,
      commentId,
    ]);
  }
}

export const feedRepository = new FeedRepository();
