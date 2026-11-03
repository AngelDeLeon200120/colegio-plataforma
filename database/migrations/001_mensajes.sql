-- =============================================================================
-- 7b. MENSAJES
-- Hilos por asunto entre familias, estudiantes y el personal del colegio.
--  - scope STUDENT: sobre un estudiante (lo ven él, sus familias, los docentes de su sección y la administración)
--  - scope SECTION: aviso del personal a toda una sección (solo el personal responde)
-- section_id se fija al crear el hilo: así los docentes de esa sección lo siguen viendo.
-- =============================================================================

CREATE TABLE message_threads (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id        BIGINT UNSIGNED NOT NULL,
  scope            ENUM('STUDENT','SECTION') NOT NULL,
  student_id       BIGINT UNSIGNED NULL COMMENT 'Solo scope STUDENT',
  section_id       BIGINT UNSIGNED NOT NULL,
  topic            ENUM('TAREAS','AUSENCIA') NOT NULL,
  reason           ENUM('LLEGA_TARDE','SIN_UNIFORME','VACACIONES','FALLECIMIENTO','ENFERMEDAD') NULL COMMENT 'Solo topic AUSENCIA',
  subject          VARCHAR(200)    NOT NULL,
  created_by       BIGINT UNSIGNED NOT NULL,
  last_message_id  BIGINT UNSIGNED NULL,
  last_message_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_message_threads_tenant (school_id, id),
  KEY        ix_message_threads_section (school_id, section_id, last_message_at),
  KEY        ix_message_threads_student (school_id, student_id, last_message_at),
  KEY        ix_message_threads_recent  (school_id, last_message_at),
  CONSTRAINT fk_message_threads_student FOREIGN KEY (school_id, student_id)
    REFERENCES students (school_id, id),
  CONSTRAINT fk_message_threads_section FOREIGN KEY (school_id, section_id)
    REFERENCES sections (school_id, id),
  CONSTRAINT fk_message_threads_author FOREIGN KEY (school_id, created_by)
    REFERENCES users (school_id, id),
  CONSTRAINT ck_message_threads_scope CHECK ((scope = 'STUDENT') = (student_id IS NOT NULL)),
  CONSTRAINT ck_message_threads_reason CHECK ((topic = 'AUSENCIA') = (reason IS NOT NULL))
) ENGINE=InnoDB;

CREATE TABLE messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id   BIGINT UNSIGNED NOT NULL,
  thread_id   BIGINT UNSIGNED NOT NULL,
  author_id   BIGINT UNSIGNED NOT NULL,
  body        TEXT            NOT NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_messages_thread (school_id, thread_id, id),
  CONSTRAINT fk_messages_thread FOREIGN KEY (school_id, thread_id)
    REFERENCES message_threads (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_author FOREIGN KEY (school_id, author_id)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- Hasta qué mensaje leyó cada usuario: un hilo está sin leer si tiene mensajes ajenos posteriores
CREATE TABLE message_reads (
  school_id             BIGINT UNSIGNED NOT NULL,
  thread_id             BIGINT UNSIGNED NOT NULL,
  user_id               BIGINT UNSIGNED NOT NULL,
  last_read_message_id  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (thread_id, user_id),
  KEY ix_message_reads_user (school_id, user_id),
  CONSTRAINT fk_message_reads_thread FOREIGN KEY (school_id, thread_id)
    REFERENCES message_threads (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_message_reads_user FOREIGN KEY (school_id, user_id)
    REFERENCES users (school_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;
