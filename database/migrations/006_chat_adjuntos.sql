-- =============================================================================
-- Migración 006 — Adjuntos (fotos, videos y archivos) en el chat del personal
--
-- Agrega el valor STAFF_CHAT al final del ENUM files.purpose (las filas existentes no cambian)
-- y la tabla de adjuntos. Se puede aplicar más de una vez.
-- =============================================================================

USE colegio_saas;

ALTER TABLE files
  MODIFY purpose ENUM('ACTIVITY_RESOURCE','SUBMISSION','GRADE_IMPORT','AVATAR','PAYMENT_RECEIPT','POST_IMAGE','STAFF_CHAT') NOT NULL;

CREATE TABLE IF NOT EXISTS staff_chat_attachments (
  school_id   BIGINT UNSIGNED  NOT NULL,
  message_id  BIGINT UNSIGNED  NOT NULL,
  file_id     BIGINT UNSIGNED  NOT NULL,
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (message_id, file_id),
  KEY ix_staff_chat_attachments_file (school_id, file_id),
  CONSTRAINT fk_staff_chat_attachments_file FOREIGN KEY (school_id, file_id) REFERENCES files (school_id, id)
) ENGINE=InnoDB;
