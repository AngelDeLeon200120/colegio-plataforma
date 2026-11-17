-- =============================================================================
-- Migración 003 — Reportes de conducta hacia las familias
--
-- Solo agrega tablas nuevas (IF NOT EXISTS). No cambia ni borra nada existente.
-- Se puede aplicar más de una vez sin efecto adicional.
-- =============================================================================

USE colegio_saas;

-- Un reporte: lo crea el docente (de su sección) o la administración y lo ve la familia.
-- La administración puede anularlo (no se borra: queda con motivo y deja de contar).
CREATE TABLE IF NOT EXISTS conduct_reports (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id         BIGINT UNSIGNED NOT NULL,
  academic_year_id  BIGINT UNSIGNED NOT NULL COMMENT 'El contador es por ciclo',
  student_id        BIGINT UNSIGNED NOT NULL,
  section_id        BIGINT UNSIGNED NOT NULL,
  category          ENUM('LLEGADA_TARDE','FALTA_RESPETO','INDISCIPLINA','CELULAR','TAREA_COPIADA','OTRO') NOT NULL,
  description       TEXT            NOT NULL COMMENT 'Qué fue lo que pasó',
  incident_date     DATE            NOT NULL,
  reported_by       BIGINT UNSIGNED NOT NULL,
  status            ENUM('ACTIVE','VOID') NOT NULL DEFAULT 'ACTIVE',
  void_reason       VARCHAR(300)    NULL,
  voided_by         BIGINT UNSIGNED NULL,
  voided_at         DATETIME        NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conduct_reports_tenant (school_id, id),
  KEY ix_conduct_reports_student (school_id, student_id, academic_year_id, status),
  KEY ix_conduct_reports_section (school_id, section_id, created_at),
  CONSTRAINT fk_conduct_reports_year     FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years (school_id, id),
  CONSTRAINT fk_conduct_reports_student  FOREIGN KEY (school_id, student_id) REFERENCES students (school_id, id),
  CONSTRAINT fk_conduct_reports_section  FOREIGN KEY (school_id, section_id) REFERENCES sections (school_id, id),
  CONSTRAINT fk_conduct_reports_author   FOREIGN KEY (school_id, reported_by) REFERENCES users (school_id, id),
  CONSTRAINT fk_conduct_reports_voider   FOREIGN KEY (school_id, voided_by) REFERENCES users (school_id, id),
  CONSTRAINT ck_conduct_reports_void CHECK ((status = 'VOID') = (voided_at IS NOT NULL))
) ENGINE=InnoDB;

-- Seguimiento: se abre solo al llegar a 3 reportes en el ciclo (y luego a 6, 9...).
-- La institución decide: citar a la familia, reunión con tutor u otra medida.
CREATE TABLE IF NOT EXISTS conduct_followups (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id         BIGINT UNSIGNED NOT NULL,
  academic_year_id  BIGINT UNSIGNED NOT NULL,
  student_id        BIGINT UNSIGNED NOT NULL,
  report_count      SMALLINT UNSIGNED NOT NULL COMMENT 'Reportes con los que se abrió (3, 6, 9...)',
  status            ENUM('PENDIENTE','PROGRAMADO','RESUELTO') NOT NULL DEFAULT 'PENDIENTE',
  decision          ENUM('CITA_FAMILIA','REUNION_TUTOR','OTRA') NULL,
  meeting_at        DATETIME        NULL COMMENT 'UTC',
  notes             TEXT            NULL,
  outcome           TEXT            NULL COMMENT 'Acuerdos al resolverlo',
  handled_by        BIGINT UNSIGNED NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conduct_followups_tenant (school_id, id),
  UNIQUE KEY uq_conduct_followups_step   (student_id, academic_year_id, report_count),
  KEY ix_conduct_followups_status (school_id, status, created_at),
  CONSTRAINT fk_conduct_followups_year    FOREIGN KEY (school_id, academic_year_id) REFERENCES academic_years (school_id, id),
  CONSTRAINT fk_conduct_followups_student FOREIGN KEY (school_id, student_id) REFERENCES students (school_id, id),
  CONSTRAINT fk_conduct_followups_user    FOREIGN KEY (school_id, handled_by) REFERENCES users (school_id, id)
) ENGINE=InnoDB;
