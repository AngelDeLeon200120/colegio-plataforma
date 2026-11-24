-- =============================================================================
-- Migración 010 — Asistencia diaria
--
-- El docente pasa lista por curso y día durante la unidad. Con eso se llena sola la
-- columna Asistencia del cuadro de notas (80 % o más = todos los puntos).
-- Solo agrega una tabla (IF NOT EXISTS); se puede aplicar más de una vez.
-- Requiere la migración 009.
-- =============================================================================

USE colegio_saas;

CREATE TABLE IF NOT EXISTS attendance_records (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id         BIGINT UNSIGNED NOT NULL,
  course_id         BIGINT UNSIGNED NOT NULL,
  academic_unit_id  BIGINT UNSIGNED NOT NULL,
  student_id        BIGINT UNSIGNED NOT NULL,
  attended_on       DATE            NOT NULL,
  status            ENUM('PRESENT','ABSENT','EXCUSED') NOT NULL COMMENT 'EXCUSED: falta justificada, no cuenta',
  marked_by         BIGINT UNSIGNED NOT NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_day (course_id, student_id, attended_on),
  KEY ix_attendance_unit    (school_id, course_id, academic_unit_id, attended_on),
  KEY ix_attendance_student (school_id, student_id),
  CONSTRAINT fk_attendance_course  FOREIGN KEY (school_id, course_id) REFERENCES courses (school_id, id),
  CONSTRAINT fk_attendance_unit    FOREIGN KEY (school_id, academic_unit_id) REFERENCES academic_units (school_id, id),
  CONSTRAINT fk_attendance_student FOREIGN KEY (school_id, student_id) REFERENCES students (school_id, id),
  CONSTRAINT fk_attendance_marker  FOREIGN KEY (school_id, marked_by) REFERENCES users (school_id, id)
) ENGINE=InnoDB;
