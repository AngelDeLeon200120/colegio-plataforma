-- =============================================================================
-- Migración 005 — Chat del personal (administración y todos los docentes del colegio)
--
-- Una sala por colegio. Solo agrega tablas (IF NOT EXISTS); se puede aplicar más de una vez.
-- =============================================================================

USE colegio_saas;

CREATE TABLE IF NOT EXISTS staff_chat_messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id   BIGINT UNSIGNED NOT NULL,
  author_id   BIGINT UNSIGNED NOT NULL,
  body        TEXT            NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  DATETIME        NULL COMMENT 'Borrado por su autor o la administración: queda "mensaje eliminado"',
  deleted_by  BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_staff_chat_messages_school (school_id, id),
  CONSTRAINT fk_staff_chat_messages_author  FOREIGN KEY (school_id, author_id) REFERENCES users (school_id, id),
  CONSTRAINT fk_staff_chat_messages_deleter FOREIGN KEY (school_id, deleted_by) REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- Hasta qué mensaje leyó cada persona (para el contador de no leídos)
CREATE TABLE IF NOT EXISTS staff_chat_reads (
  school_id             BIGINT UNSIGNED NOT NULL,
  user_id               BIGINT UNSIGNED NOT NULL,
  last_read_message_id  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  KEY ix_staff_chat_reads_school (school_id),
  CONSTRAINT fk_staff_chat_reads_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;
