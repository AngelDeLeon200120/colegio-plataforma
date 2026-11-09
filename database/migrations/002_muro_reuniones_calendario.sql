-- =============================================================================
-- Migración 002 — Muro de Inicio, mejora de notas, reuniones virtuales y calendario
--
-- Solo agrega: tablas nuevas (IF NOT EXISTS) y un valor nuevo al final del ENUM
-- files.purpose. No borra ni cambia columnas ni datos existentes. Se puede
-- aplicar más de una vez sin efecto adicional.
-- =============================================================================

USE colegio_saas;

-- Imágenes de publicaciones del muro (el valor se agrega al final: las filas existentes no cambian)
ALTER TABLE files
  MODIFY purpose ENUM('ACTIVITY_RESOURCE','SUBMISSION','GRADE_IMPORT','AVATAR','PAYMENT_RECEIPT','POST_IMAGE') NOT NULL;

-- -----------------------------------------------------------------------------
-- MURO DE INICIO: publicaciones de la administración; todos reaccionan y comentan
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id      BIGINT UNSIGNED NOT NULL,
  author_id      BIGINT UNSIGNED NOT NULL,
  body           TEXT            NOT NULL,
  image_file_id  BIGINT UNSIGNED NULL,
  is_pinned      BOOLEAN         NOT NULL DEFAULT FALSE,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at     DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_posts_tenant (school_id, id),
  KEY        ix_posts_feed   (school_id, deleted_at, is_pinned, id),
  CONSTRAINT fk_posts_author FOREIGN KEY (school_id, author_id) REFERENCES users (school_id, id),
  CONSTRAINT fk_posts_image  FOREIGN KEY (school_id, image_file_id) REFERENCES files (school_id, id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS post_reactions (
  school_id   BIGINT UNSIGNED NOT NULL,
  post_id     BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id),
  KEY ix_post_reactions_user (school_id, user_id),
  CONSTRAINT fk_post_reactions_post FOREIGN KEY (school_id, post_id) REFERENCES posts (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_post_reactions_user FOREIGN KEY (school_id, user_id) REFERENCES users (school_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS post_comments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id   BIGINT UNSIGNED NOT NULL,
  post_id     BIGINT UNSIGNED NOT NULL,
  author_id   BIGINT UNSIGNED NOT NULL,
  body        VARCHAR(1000)   NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  DATETIME        NULL,
  PRIMARY KEY (id),
  KEY ix_post_comments_post (school_id, post_id, id),
  CONSTRAINT fk_post_comments_post   FOREIGN KEY (school_id, post_id) REFERENCES posts (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_post_comments_author FOREIGN KEY (school_id, author_id) REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- HISTORIAL DE NOTAS: cada "Mejora" de una celda (también sobre notas aprobadas).
-- No genera notificaciones; la celda se marca en azul si tiene alguna mejora.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grade_score_changes (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id      BIGINT UNSIGNED NOT NULL,
  grade_item_id  BIGINT UNSIGNED NOT NULL,
  student_id     BIGINT UNSIGNED NOT NULL,
  kind           ENUM('MEJORA') NOT NULL DEFAULT 'MEJORA',
  old_score      DECIMAL(5,2)    NULL,
  new_score      DECIMAL(5,2)    NULL,
  note           VARCHAR(255)    NULL,
  changed_by     BIGINT UNSIGNED NOT NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_grade_changes_cell (school_id, grade_item_id, student_id, id),
  CONSTRAINT fk_grade_changes_item    FOREIGN KEY (school_id, grade_item_id) REFERENCES grade_items (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_grade_changes_student FOREIGN KEY (school_id, student_id) REFERENCES students (school_id, id),
  CONSTRAINT fk_grade_changes_user    FOREIGN KEY (school_id, changed_by) REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- REUNIONES VIRTUALES: cada reunión de una clase (curso) tiene su propio código
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meetings (
  id                BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  school_id         BIGINT UNSIGNED   NOT NULL,
  course_id         BIGINT UNSIGNED   NOT NULL,
  title             VARCHAR(150)      NOT NULL,
  description       VARCHAR(1000)     NULL,
  starts_at         DATETIME          NOT NULL COMMENT 'UTC',
  duration_minutes  SMALLINT UNSIGNED NOT NULL DEFAULT 45,
  code              VARCHAR(20)       NOT NULL COMMENT 'Código único para unirse',
  provider          ENUM('JITSI','EXTERNAL') NOT NULL DEFAULT 'JITSI',
  external_url      VARCHAR(500)      NULL COMMENT 'Solo provider EXTERNAL (Meet, Zoom, Teams)',
  status            ENUM('SCHEDULED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
  created_by        BIGINT UNSIGNED   NOT NULL,
  created_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_meetings_tenant (school_id, id),
  UNIQUE KEY uq_meetings_code   (school_id, code),
  KEY        ix_meetings_course (school_id, course_id, starts_at),
  KEY        ix_meetings_time   (school_id, starts_at),
  CONSTRAINT ck_meetings_duration CHECK (duration_minutes BETWEEN 5 AND 600),
  CONSTRAINT ck_meetings_url CHECK ((provider = 'EXTERNAL') = (external_url IS NOT NULL)),
  CONSTRAINT fk_meetings_course FOREIGN KEY (school_id, course_id) REFERENCES courses (school_id, id),
  CONSTRAINT fk_meetings_author FOREIGN KEY (school_id, created_by) REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- CALENDARIO GENERAL: eventos que administra la administración.
-- section_id NULL = para todo el colegio.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calendar_events (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id    BIGINT UNSIGNED NOT NULL,
  title        VARCHAR(150)    NOT NULL,
  description  VARCHAR(1000)   NULL,
  category     ENUM('GENERAL','FERIADO','EVALUACION','REUNION','ACTO','DEPORTE') NOT NULL DEFAULT 'GENERAL',
  starts_at    DATETIME        NOT NULL COMMENT 'UTC',
  ends_at      DATETIME        NOT NULL COMMENT 'UTC',
  all_day      BOOLEAN         NOT NULL DEFAULT FALSE,
  location     VARCHAR(150)    NULL,
  section_id   BIGINT UNSIGNED NULL,
  created_by   BIGINT UNSIGNED NOT NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   DATETIME        NULL,
  PRIMARY KEY (id),
  KEY ix_calendar_events_time (school_id, deleted_at, starts_at),
  CONSTRAINT ck_calendar_events_range CHECK (ends_at >= starts_at),
  CONSTRAINT fk_calendar_events_section FOREIGN KEY (school_id, section_id) REFERENCES sections (school_id, id),
  CONSTRAINT fk_calendar_events_author  FOREIGN KEY (school_id, created_by) REFERENCES users (school_id, id)
) ENGINE=InnoDB;
