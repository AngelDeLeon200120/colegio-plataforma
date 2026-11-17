-- =============================================================================
-- Migración 007 — Miembros del chat del personal
--
-- Por defecto todos los docentes activos del colegio están en la sala (y los nuevos
-- entran solos). La administración puede sacar a un docente: queda registrado aquí
-- y deja de ver la sala; al incluirlo de nuevo se borra la fila.
-- Solo agrega una tabla (IF NOT EXISTS); se puede aplicar más de una vez.
-- =============================================================================

USE colegio_saas;

CREATE TABLE IF NOT EXISTS staff_chat_removed (
  school_id   BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  removed_by  BIGINT UNSIGNED NOT NULL,
  removed_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY ix_staff_chat_removed_school (school_id),
  CONSTRAINT fk_staff_chat_removed_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_chat_removed_by   FOREIGN KEY (school_id, removed_by) REFERENCES users (school_id, id)
) ENGINE=InnoDB;
