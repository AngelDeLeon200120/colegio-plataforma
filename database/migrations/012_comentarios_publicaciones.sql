-- =============================================================================
-- Migración 012 — Comentarios de las publicaciones de Inicio, apagados por defecto
--
-- La administración decide en cada publicación si se puede comentar. Las nuevas nacen
-- sin comentarios. Las que ya tenían comentarios quedan activadas para que no se oculten.
-- Solo agrega una columna. Se aplica UNA sola vez.
-- =============================================================================

USE colegio_saas;

ALTER TABLE posts
  ADD COLUMN comments_enabled BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'La administración permite comentar' AFTER is_pinned;

UPDATE posts p
   SET p.comments_enabled = TRUE
 WHERE EXISTS (SELECT 1 FROM post_comments c WHERE c.school_id = p.school_id AND c.post_id = p.id AND c.deleted_at IS NULL);
