-- =============================================================================
--  Plataforma SaaS para colegios — Esquema MySQL
--  Requiere MySQL 8.0.16+ (CHECK constraints, columnas generadas, JSON)
--
--  Convenciones
--  · Toda tabla transaccional lleva school_id NOT NULL.
--  · Toda tabla con hijos expone UNIQUE (school_id, id) y los hijos usan FKs
--    compuestas (school_id, x_id) → padre(school_id, id). Esto impide en la
--    propia base de datos relacionar filas de colegios distintos.
--  · Índices compuestos comienzan por school_id.
--  · DATETIME se guarda en UTC; DATE es fecha local del colegio.
--  · DECIMAL para notas y dinero. ENUM para estados de ciclo de vida.
--  · Las FKs compuestas usan RESTRICT/CASCADE, nunca SET NULL (pondría
--    school_id en NULL). Los borrados de usuarios son lógicos (deleted_at).
-- =============================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS colegio_saas
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE colegio_saas;

-- =============================================================================
-- 1. TENANCY E IDENTIDAD
-- =============================================================================

CREATE TABLE schools (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(150)    NOT NULL,
  slug          VARCHAR(60)     NOT NULL COMMENT 'Subdominio / identificador de login',
  timezone      VARCHAR(40)     NOT NULL DEFAULT 'America/Guatemala',
  currency      CHAR(3)         NOT NULL DEFAULT 'GTQ',
  status        ENUM('TRIAL','ACTIVE','SUSPENDED') NOT NULL DEFAULT 'TRIAL',
  settings      JSON            NULL COMMENT 'Intervalo de recordatorios, nota mínima, etc.',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schools_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE users (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id      BIGINT UNSIGNED NOT NULL,
  email          VARCHAR(190)    NOT NULL,
  password_hash  VARCHAR(255)    NOT NULL,
  first_name     VARCHAR(80)     NOT NULL,
  last_name      VARCHAR(80)     NOT NULL,
  phone          VARCHAR(30)     NULL,
  role           ENUM('ADMIN','TEACHER','STUDENT','PARENT') NOT NULL,
  status         ENUM('INVITED','ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  avatar_url     VARCHAR(500)    NULL,
  token_version  INT UNSIGNED    NOT NULL DEFAULT 0 COMMENT 'Incrementar invalida todos los JWT',
  last_login_at  DATETIME        NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at     DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_tenant      (school_id, id),
  UNIQUE KEY uq_users_email       (school_id, email),
  KEY        ix_users_role        (school_id, role, status),
  CONSTRAINT fk_users_school FOREIGN KEY (school_id) REFERENCES schools (id)
) ENGINE=InnoDB;

CREATE TABLE refresh_tokens (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id    BIGINT UNSIGNED NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  token_hash   CHAR(64)        NOT NULL COMMENT 'SHA-256 del token; nunca el token en claro',
  family_id    CHAR(36)        NOT NULL COMMENT 'Rotación: reutilizar un token revoca la familia',
  expires_at   DATETIME        NOT NULL,
  revoked_at   DATETIME        NULL,
  -- Solo ROTATED tiene ventana de gracia (dos pestañas renovando a la vez)
  revoke_reason ENUM('ROTATED','REUSE_DETECTED','LOGOUT','LOGOUT_ALL','ACCOUNT_DISABLED') NULL,
  created_ip   VARCHAR(45)     NULL,
  user_agent   VARCHAR(255)    NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_hash   (token_hash),
  KEY        ix_refresh_user   (school_id, user_id),
  KEY        ix_refresh_family (family_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (school_id, user_id)
    REFERENCES users (school_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =============================================================================
-- 2. ESTRUCTURA ACADÉMICA
-- =============================================================================

CREATE TABLE academic_years (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id      BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(20)     NOT NULL COMMENT 'Ej. 2026',
  starts_on      DATE            NOT NULL,
  ends_on        DATE            NOT NULL,
  status         ENUM('PLANNING','ACTIVE','CLOSED') NOT NULL DEFAULT 'PLANNING',
  -- 1 si está activo, NULL si no: el UNIQUE permite un solo ciclo activo por colegio
  active_marker  TINYINT GENERATED ALWAYS AS (IF(status = 'ACTIVE', 1, NULL)) STORED,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_years_tenant (school_id, id),
  UNIQUE KEY uq_years_name   (school_id, name),
  UNIQUE KEY uq_years_active (school_id, active_marker),
  CONSTRAINT ck_years_dates CHECK (ends_on > starts_on),
  CONSTRAINT fk_years_school FOREIGN KEY (school_id) REFERENCES schools (id)
) ENGINE=InnoDB;

-- Unidades / bimestres / trimestres. Controlan la visibilidad del contenido.
--   SCHEDULED → oculta a alumnos y padres (futura)
--   ACTIVE    → visible y editable
--   CLOSED    → visible solo lectura (histórico); notas congeladas
CREATE TABLE academic_units (
  id                BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  school_id         BIGINT UNSIGNED  NOT NULL,
  academic_year_id  BIGINT UNSIGNED  NOT NULL,
  sequence_no       TINYINT UNSIGNED NOT NULL COMMENT '1..N',
  name              VARCHAR(60)      NOT NULL COMMENT 'Ej. Unidad I',
  starts_on         DATE             NOT NULL,
  ends_on           DATE             NOT NULL,
  status            ENUM('SCHEDULED','ACTIVE','CLOSED') NOT NULL DEFAULT 'SCHEDULED',
  active_marker     TINYINT GENERATED ALWAYS AS (IF(status = 'ACTIVE', 1, NULL)) STORED,
  activated_at      DATETIME         NULL,
  closed_at         DATETIME         NULL,
  closed_by         BIGINT UNSIGNED  NULL,
  created_at        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_units_tenant   (school_id, id),
  UNIQUE KEY uq_units_sequence (academic_year_id, sequence_no),
  UNIQUE KEY uq_units_active   (academic_year_id, active_marker),
  KEY        ix_units_status   (school_id, status, starts_on),
  CONSTRAINT ck_units_dates CHECK (ends_on > starts_on),
  CONSTRAINT fk_units_year FOREIGN KEY (school_id, academic_year_id)
    REFERENCES academic_years (school_id, id),
  CONSTRAINT fk_units_closed_by FOREIGN KEY (school_id, closed_by)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

CREATE TABLE grade_levels (
  id               BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  school_id        BIGINT UNSIGNED   NOT NULL,
  name             VARCHAR(60)       NOT NULL COMMENT 'Ej. Tercero Primaria',
  short_name       VARCHAR(15)       NOT NULL COMMENT 'Ej. 3ro',
  education_level  VARCHAR(40)       NULL     COMMENT 'Preprimaria, Primaria, Básicos...',
  sort_order       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grade_levels_tenant (school_id, id),
  UNIQUE KEY uq_grade_levels_name   (school_id, name),
  CONSTRAINT fk_grade_levels_school FOREIGN KEY (school_id) REFERENCES schools (id)
) ENGINE=InnoDB;

CREATE TABLE sections (
  id                   BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  school_id            BIGINT UNSIGNED   NOT NULL,
  academic_year_id     BIGINT UNSIGNED   NOT NULL,
  grade_level_id       BIGINT UNSIGNED   NOT NULL,
  name                 VARCHAR(10)       NOT NULL COMMENT 'Ej. B',
  homeroom_teacher_id  BIGINT UNSIGNED   NULL,
  capacity             SMALLINT UNSIGNED NULL,
  created_at           DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sections_tenant (school_id, id),
  UNIQUE KEY uq_sections_name   (academic_year_id, grade_level_id, name),
  KEY        ix_sections_year   (school_id, academic_year_id),
  CONSTRAINT fk_sections_year FOREIGN KEY (school_id, academic_year_id)
    REFERENCES academic_years (school_id, id),
  CONSTRAINT fk_sections_grade FOREIGN KEY (school_id, grade_level_id)
    REFERENCES grade_levels (school_id, id),
  CONSTRAINT fk_sections_homeroom FOREIGN KEY (school_id, homeroom_teacher_id)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

CREATE TABLE subjects (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id  BIGINT UNSIGNED NOT NULL,
  code       VARCHAR(20)     NOT NULL COMMENT 'Ej. MAT',
  name       VARCHAR(100)    NOT NULL,
  color      CHAR(7)         NULL     COMMENT 'Hex para la UI',
  is_active  BOOLEAN         NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subjects_tenant (school_id, id),
  UNIQUE KEY uq_subjects_code   (school_id, code),
  CONSTRAINT fk_subjects_school FOREIGN KEY (school_id) REFERENCES schools (id)
) ENGINE=InnoDB;

-- Curso = sección + materia + profesor ("3ro B · Matemáticas").
-- Es la unidad a la que se asignan actividades y notas.
CREATE TABLE courses (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id   BIGINT UNSIGNED NOT NULL,
  section_id  BIGINT UNSIGNED NOT NULL,
  subject_id  BIGINT UNSIGNED NOT NULL,
  teacher_id  BIGINT UNSIGNED NOT NULL,
  is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_courses_tenant          (school_id, id),
  UNIQUE KEY uq_courses_section_subject (section_id, subject_id),
  KEY        ix_courses_teacher         (school_id, teacher_id, is_active),
  CONSTRAINT fk_courses_section FOREIGN KEY (school_id, section_id)
    REFERENCES sections (school_id, id),
  CONSTRAINT fk_courses_subject FOREIGN KEY (school_id, subject_id)
    REFERENCES subjects (school_id, id),
  CONSTRAINT fk_courses_teacher FOREIGN KEY (school_id, teacher_id)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- =============================================================================
-- 3. ALUMNOS, ENCARGADOS E INSCRIPCIONES
-- =============================================================================

-- El alumno existe aunque no tenga cuenta de acceso (user_id NULL, ej. preprimaria).
CREATE TABLE students (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id     BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NULL,
  student_code  VARCHAR(30)     NOT NULL COMMENT 'Código usado en plantillas de notas',
  first_name    VARCHAR(80)     NOT NULL,
  last_name     VARCHAR(80)     NOT NULL,
  birth_date    DATE            NULL,
  status        ENUM('ACTIVE','WITHDRAWN','GRADUATED') NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_students_tenant (school_id, id),
  UNIQUE KEY uq_students_code   (school_id, student_code),
  UNIQUE KEY uq_students_user   (user_id),
  KEY        ix_students_name   (school_id, last_name, first_name),
  CONSTRAINT fk_students_user FOREIGN KEY (school_id, user_id)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

CREATE TABLE guardian_students (
  school_id                 BIGINT UNSIGNED NOT NULL,
  guardian_id               BIGINT UNSIGNED NOT NULL COMMENT 'users.role = PARENT',
  student_id                BIGINT UNSIGNED NOT NULL,
  relationship              ENUM('MOTHER','FATHER','GUARDIAN','OTHER') NOT NULL,
  is_primary                BOOLEAN NOT NULL DEFAULT FALSE,
  receives_notifications    BOOLEAN NOT NULL DEFAULT TRUE,
  is_financial_responsible  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guardian_id, student_id),
  KEY ix_guardians_student (school_id, student_id),
  CONSTRAINT fk_guardians_user FOREIGN KEY (school_id, guardian_id)
    REFERENCES users (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_guardians_student FOREIGN KEY (school_id, student_id)
    REFERENCES students (school_id, id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE enrollments (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id         BIGINT UNSIGNED NOT NULL,
  student_id        BIGINT UNSIGNED NOT NULL,
  section_id        BIGINT UNSIGNED NOT NULL,
  academic_year_id  BIGINT UNSIGNED NOT NULL COMMENT 'Redundante con la sección: habilita el UNIQUE por ciclo',
  status            ENUM('ACTIVE','TRANSFERRED','WITHDRAWN') NOT NULL DEFAULT 'ACTIVE',
  enrolled_on       DATE            NOT NULL,
  ended_on          DATE            NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_enrollments_tenant       (school_id, id),
  UNIQUE KEY uq_enrollments_student_year (student_id, academic_year_id),
  KEY        ix_enrollments_section      (school_id, section_id, status),
  CONSTRAINT fk_enrollments_student FOREIGN KEY (school_id, student_id)
    REFERENCES students (school_id, id),
  CONSTRAINT fk_enrollments_section FOREIGN KEY (school_id, section_id)
    REFERENCES sections (school_id, id),
  CONSTRAINT fk_enrollments_year FOREIGN KEY (school_id, academic_year_id)
    REFERENCES academic_years (school_id, id)
) ENGINE=InnoDB;

-- =============================================================================
-- 4. ARCHIVOS (almacenamiento local / S3 / Cloudinary)
-- =============================================================================

CREATE TABLE files (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id      BIGINT UNSIGNED NOT NULL,
  uploaded_by    BIGINT UNSIGNED NOT NULL,
  provider       ENUM('LOCAL','S3','CLOUDINARY') NOT NULL,
  storage_key    VARCHAR(500)    NOT NULL COMMENT 'schools/{id}/{purpose}/{uuid}.{ext}',
  original_name  VARCHAR(255)    NOT NULL,
  mime_type      VARCHAR(120)    NOT NULL,
  size_bytes     INT UNSIGNED    NOT NULL,
  sha256         CHAR(64)        NULL,
  purpose        ENUM('ACTIVITY_RESOURCE','SUBMISSION','GRADE_IMPORT','AVATAR','PAYMENT_RECEIPT') NOT NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at     DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_files_tenant  (school_id, id),
  UNIQUE KEY uq_files_key     (provider, storage_key),
  KEY        ix_files_owner   (school_id, uploaded_by, created_at),
  CONSTRAINT ck_files_size CHECK (size_bytes > 0),
  CONSTRAINT fk_files_uploader FOREIGN KEY (school_id, uploaded_by)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- =============================================================================
-- 5. ACTIVIDADES Y ENTREGAS
-- =============================================================================

CREATE TABLE activities (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id            BIGINT UNSIGNED NOT NULL,
  course_id            BIGINT UNSIGNED NOT NULL,
  academic_unit_id     BIGINT UNSIGNED NOT NULL,
  created_by           BIGINT UNSIGNED NOT NULL,
  title                VARCHAR(200)    NOT NULL,
  description          TEXT            NULL,
  type                 ENUM('TASK','PROJECT','EXAM','READING','PRACTICE') NOT NULL DEFAULT 'TASK',
  status               ENUM('DRAFT','PUBLISHED','CLOSED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  requires_submission  BOOLEAN         NOT NULL DEFAULT TRUE,
  allow_late           BOOLEAN         NOT NULL DEFAULT TRUE,
  max_score            DECIMAL(5,2)    NULL,
  publish_at           DATETIME        NULL COMMENT 'Publicación programada',
  due_at               DATETIME        NULL,
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at           DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_activities_tenant (school_id, id),
  KEY        ix_activities_course (school_id, course_id, academic_unit_id, status),
  KEY        ix_activities_due    (school_id, status, due_at),
  KEY        ix_activities_unit   (school_id, academic_unit_id),
  CONSTRAINT ck_activities_score CHECK (max_score IS NULL OR max_score > 0),
  CONSTRAINT fk_activities_course FOREIGN KEY (school_id, course_id)
    REFERENCES courses (school_id, id),
  CONSTRAINT fk_activities_unit FOREIGN KEY (school_id, academic_unit_id)
    REFERENCES academic_units (school_id, id),
  CONSTRAINT fk_activities_author FOREIGN KEY (school_id, created_by)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- Material de apoyo que adjunta el profesor
CREATE TABLE activity_files (
  school_id    BIGINT UNSIGNED NOT NULL,
  activity_id  BIGINT UNSIGNED NOT NULL,
  file_id      BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (activity_id, file_id),
  KEY ix_activity_files_file (school_id, file_id),
  CONSTRAINT fk_activity_files_activity FOREIGN KEY (school_id, activity_id)
    REFERENCES activities (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_files_file FOREIGN KEY (school_id, file_id)
    REFERENCES files (school_id, id)
) ENGINE=InnoDB;

-- Una fila por (actividad, alumno). Se crea al publicar la actividad, por lo que
-- "pendiente" es un estado explícito. Es el agregado que lee el cron.
--
-- next_reminder_at gobierna los recordatorios cíclicos:
--   publicar → due_at | entregar → NULL | rechazar → NOW()+intervalo
--   aprobar → NULL     | cron envía → NOW()+intervalo
CREATE TABLE submissions (
  id                BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  school_id         BIGINT UNSIGNED   NOT NULL,
  activity_id       BIGINT UNSIGNED   NOT NULL,
  student_id        BIGINT UNSIGNED   NOT NULL,
  status            ENUM('PENDING','SUBMITTED','REJECTED','APPROVED') NOT NULL DEFAULT 'PENDING',
  attempt_count     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  last_submitted_at DATETIME          NULL,
  is_late           BOOLEAN           NOT NULL DEFAULT FALSE,
  score             DECIMAL(5,2)      NULL,
  last_feedback     TEXT              NULL COMMENT 'Desnormalizado de la última revisión',
  reviewed_by       BIGINT UNSIGNED   NULL,
  reviewed_at       DATETIME          NULL,
  next_reminder_at  DATETIME          NULL,
  reminder_count    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  last_reminded_at  DATETIME          NULL,
  version           INT UNSIGNED      NOT NULL DEFAULT 0 COMMENT 'Bloqueo optimista en revisiones',
  created_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_submissions_tenant           (school_id, id),
  UNIQUE KEY uq_submissions_activity_student (activity_id, student_id),
  KEY        ix_submissions_review_queue     (school_id, activity_id, status),
  KEY        ix_submissions_student          (school_id, student_id, status),
  KEY        ix_submissions_reminders        (school_id, status, next_reminder_at),
  CONSTRAINT ck_submissions_score CHECK (score IS NULL OR score >= 0),
  CONSTRAINT fk_submissions_activity FOREIGN KEY (school_id, activity_id)
    REFERENCES activities (school_id, id),
  CONSTRAINT fk_submissions_student FOREIGN KEY (school_id, student_id)
    REFERENCES students (school_id, id),
  CONSTRAINT fk_submissions_reviewer FOREIGN KEY (school_id, reviewed_by)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- Cada envío o reenvío del alumno
CREATE TABLE submission_attempts (
  id               BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  school_id        BIGINT UNSIGNED   NOT NULL,
  submission_id    BIGINT UNSIGNED   NOT NULL,
  attempt_number   SMALLINT UNSIGNED NOT NULL,
  student_comment  TEXT              NULL,
  submitted_by     BIGINT UNSIGNED   NOT NULL,
  is_late          BOOLEAN           NOT NULL DEFAULT FALSE,
  submitted_at     DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attempts_tenant (school_id, id),
  UNIQUE KEY uq_attempts_number (submission_id, attempt_number),
  CONSTRAINT fk_attempts_submission FOREIGN KEY (school_id, submission_id)
    REFERENCES submissions (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_attempts_user FOREIGN KEY (school_id, submitted_by)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

CREATE TABLE submission_attempt_files (
  school_id   BIGINT UNSIGNED NOT NULL,
  attempt_id  BIGINT UNSIGNED NOT NULL,
  file_id     BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (attempt_id, file_id),
  KEY ix_attempt_files_file (school_id, file_id),
  CONSTRAINT fk_attempt_files_attempt FOREIGN KEY (school_id, attempt_id)
    REFERENCES submission_attempts (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_attempt_files_file FOREIGN KEY (school_id, file_id)
    REFERENCES files (school_id, id)
) ENGINE=InnoDB;

-- Historial de decisiones del profesor. Rechazar exige comentario.
CREATE TABLE submission_reviews (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id      BIGINT UNSIGNED NOT NULL,
  submission_id  BIGINT UNSIGNED NOT NULL,
  attempt_id     BIGINT UNSIGNED NOT NULL,
  reviewer_id    BIGINT UNSIGNED NOT NULL,
  decision       ENUM('APPROVED','REJECTED') NOT NULL,
  feedback       TEXT            NULL,
  score          DECIMAL(5,2)    NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_reviews_submission (school_id, submission_id, created_at),
  CONSTRAINT ck_reviews_feedback CHECK (
    decision = 'APPROVED' OR (feedback IS NOT NULL AND CHAR_LENGTH(TRIM(feedback)) > 0)
  ),
  CONSTRAINT fk_reviews_submission FOREIGN KEY (school_id, submission_id)
    REFERENCES submissions (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_attempt FOREIGN KEY (school_id, attempt_id)
    REFERENCES submission_attempts (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_reviewer FOREIGN KEY (school_id, reviewer_id)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- =============================================================================
-- 6. CUADRO DE NOTAS (ingreso estilo Excel)
-- =============================================================================

-- Columnas de la hoja: cada evaluación de un curso en una unidad.
CREATE TABLE grade_items (
  id                BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  school_id         BIGINT UNSIGNED   NOT NULL,
  course_id         BIGINT UNSIGNED   NOT NULL,
  academic_unit_id  BIGINT UNSIGNED   NOT NULL,
  activity_id       BIGINT UNSIGNED   NULL COMMENT 'Opcional: columna ligada a una actividad',
  name              VARCHAR(100)      NOT NULL,
  max_score         DECIMAL(5,2)      NOT NULL DEFAULT 100.00,
  weight            DECIMAL(5,2)      NOT NULL DEFAULT 0.00 COMMENT '% del total de la unidad',
  sort_order        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_published      BOOLEAN           NOT NULL DEFAULT FALSE COMMENT 'Visible para alumnos/padres',
  created_by        BIGINT UNSIGNED   NOT NULL,
  created_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grade_items_tenant   (school_id, id),
  UNIQUE KEY uq_grade_items_activity (activity_id),
  KEY        ix_grade_items_sheet    (school_id, course_id, academic_unit_id, sort_order),
  CONSTRAINT ck_grade_items_max    CHECK (max_score > 0),
  CONSTRAINT ck_grade_items_weight CHECK (weight BETWEEN 0 AND 100),
  CONSTRAINT fk_grade_items_course FOREIGN KEY (school_id, course_id)
    REFERENCES courses (school_id, id),
  CONSTRAINT fk_grade_items_unit FOREIGN KEY (school_id, academic_unit_id)
    REFERENCES academic_units (school_id, id),
  CONSTRAINT fk_grade_items_activity FOREIGN KEY (school_id, activity_id)
    REFERENCES activities (school_id, id),
  CONSTRAINT fk_grade_items_author FOREIGN KEY (school_id, created_by)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- Celdas de la hoja. El UNIQUE habilita guardado masivo con
-- INSERT ... ON DUPLICATE KEY UPDATE (pegado de bloques e importaciones).
-- La regla score <= grade_items.max_score se valida en el servicio.
CREATE TABLE grade_scores (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id      BIGINT UNSIGNED NOT NULL,
  grade_item_id  BIGINT UNSIGNED NOT NULL,
  student_id     BIGINT UNSIGNED NOT NULL,
  score          DECIMAL(5,2)    NULL,
  is_excused     BOOLEAN         NOT NULL DEFAULT FALSE,
  comment        VARCHAR(255)    NULL,
  updated_by     BIGINT UNSIGNED NOT NULL,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grade_scores_cell    (grade_item_id, student_id),
  KEY        ix_grade_scores_student (school_id, student_id),
  CONSTRAINT ck_grade_scores_score CHECK (score IS NULL OR score >= 0),
  CONSTRAINT fk_grade_scores_item FOREIGN KEY (school_id, grade_item_id)
    REFERENCES grade_items (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_grade_scores_student FOREIGN KEY (school_id, student_id)
    REFERENCES students (school_id, id),
  CONSTRAINT fk_grade_scores_user FOREIGN KEY (school_id, updated_by)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- Importación en dos fases: VALIDATED (sin errores, lista para aplicar) o
-- REJECTED (con errores por fila) → APPLIED (escritura transaccional).
-- Nunca se aplica un archivo parcialmente.
CREATE TABLE grade_imports (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id         BIGINT UNSIGNED NOT NULL,
  course_id         BIGINT UNSIGNED NOT NULL,
  academic_unit_id  BIGINT UNSIGNED NOT NULL,
  file_id           BIGINT UNSIGNED NOT NULL,
  uploaded_by       BIGINT UNSIGNED NOT NULL,
  status            ENUM('VALIDATED','REJECTED','APPLIED','DISCARDED') NOT NULL,
  total_rows        INT UNSIGNED    NOT NULL DEFAULT 0,
  valid_rows        INT UNSIGNED    NOT NULL DEFAULT 0,
  error_rows        INT UNSIGNED    NOT NULL DEFAULT 0,
  errors            JSON            NULL COMMENT '[{row, column, code, message}]',
  parsed_payload    JSON            NULL COMMENT 'Filas válidas listas para aplicar',
  applied_at        DATETIME        NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_grade_imports_course (school_id, course_id, created_at),
  CONSTRAINT fk_grade_imports_course FOREIGN KEY (school_id, course_id)
    REFERENCES courses (school_id, id),
  CONSTRAINT fk_grade_imports_unit FOREIGN KEY (school_id, academic_unit_id)
    REFERENCES academic_units (school_id, id),
  CONSTRAINT fk_grade_imports_file FOREIGN KEY (school_id, file_id)
    REFERENCES files (school_id, id),
  CONSTRAINT fk_grade_imports_user FOREIGN KEY (school_id, uploaded_by)
    REFERENCES users (school_id, id)
) ENGINE=InnoDB;

-- =============================================================================
-- 7. NOTIFICACIONES
-- =============================================================================

-- type es VARCHAR (catálogo extensible en código, ej. 'SUBMISSION_REJECTED',
-- 'ACTIVITY_OVERDUE', 'CORRECTION_PENDING', 'PAYMENT_DUE_SOON').
-- dedupe_key evita duplicados cuando un job se reintenta:
--   'overdue:{submissionId}:{yyyy-mm-dd}'
CREATE TABLE notifications (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id     BIGINT UNSIGNED NOT NULL,
  recipient_id  BIGINT UNSIGNED NOT NULL,
  type          VARCHAR(50)     NOT NULL,
  priority      ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  title         VARCHAR(200)    NOT NULL,
  body          VARCHAR(1000)   NULL,
  entity_type   VARCHAR(40)     NULL COMMENT 'activity | submission | charge ...',
  entity_id     BIGINT UNSIGNED NULL,
  student_id    BIGINT UNSIGNED NULL COMMENT 'Contexto para padres con varios hijos',
  action_url    VARCHAR(300)    NULL,
  data          JSON            NULL,
  dedupe_key    VARCHAR(120)    NULL,
  read_at       DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notifications_dedupe (recipient_id, dedupe_key),
  KEY        ix_notifications_inbox  (school_id, recipient_id, id),
  KEY        ix_notifications_unread (school_id, recipient_id, read_at),
  KEY        ix_notifications_entity (school_id, entity_type, entity_id),
  CONSTRAINT fk_notifications_recipient FOREIGN KEY (school_id, recipient_id)
    REFERENCES users (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_student FOREIGN KEY (school_id, student_id)
    REFERENCES students (school_id, id)
) ENGINE=InnoDB;

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

-- =============================================================================
-- 8. FINANZAS
-- =============================================================================

CREATE TABLE fee_concepts (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id       BIGINT UNSIGNED NOT NULL,
  code            VARCHAR(20)     NOT NULL COMMENT 'COLEG, INSCR, BUS...',
  name            VARCHAR(100)    NOT NULL,
  default_amount  DECIMAL(12,2)   NOT NULL,
  is_recurring    BOOLEAN         NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fee_concepts_tenant (school_id, id),
  UNIQUE KEY uq_fee_concepts_code   (school_id, code),
  CONSTRAINT ck_fee_concepts_amount CHECK (default_amount >= 0),
  CONSTRAINT fk_fee_concepts_school FOREIGN KEY (school_id) REFERENCES schools (id)
) ENGINE=InnoDB;

-- Lo que se cobra. El saldo es columna generada: nunca se desincroniza.
CREATE TABLE charges (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id         BIGINT UNSIGNED NOT NULL,
  student_id        BIGINT UNSIGNED NOT NULL,
  academic_year_id  BIGINT UNSIGNED NOT NULL,
  fee_concept_id    BIGINT UNSIGNED NOT NULL,
  period_label      VARCHAR(20)     NOT NULL COMMENT 'Ej. 2026-03 o UNICO',
  description       VARCHAR(200)    NOT NULL,
  amount            DECIMAL(12,2)   NOT NULL,
  discount          DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  late_fee          DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  paid_amount       DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  balance           DECIMAL(12,2)   GENERATED ALWAYS AS (amount - discount + late_fee - paid_amount) STORED,
  due_date          DATE            NOT NULL,
  status            ENUM('PENDING','PARTIAL','PAID','OVERDUE','VOID') NOT NULL DEFAULT 'PENDING',
  last_reminded_at  DATETIME        NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_charges_tenant  (school_id, id),
  UNIQUE KEY uq_charges_period  (student_id, fee_concept_id, period_label),
  KEY        ix_charges_due     (school_id, status, due_date),
  KEY        ix_charges_student (school_id, student_id, due_date),
  CONSTRAINT ck_charges_amounts CHECK (
    amount >= 0 AND discount >= 0 AND late_fee >= 0 AND paid_amount >= 0
    AND discount <= amount
    AND paid_amount <= amount - discount + late_fee
  ),
  CONSTRAINT fk_charges_student FOREIGN KEY (school_id, student_id)
    REFERENCES students (school_id, id),
  CONSTRAINT fk_charges_year FOREIGN KEY (school_id, academic_year_id)
    REFERENCES academic_years (school_id, id),
  CONSTRAINT fk_charges_concept FOREIGN KEY (school_id, fee_concept_id)
    REFERENCES fee_concepts (school_id, id)
) ENGINE=InnoDB;

-- Lo que entra
CREATE TABLE payments (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id        BIGINT UNSIGNED NOT NULL,
  student_id       BIGINT UNSIGNED NOT NULL,
  payer_user_id    BIGINT UNSIGNED NULL,
  amount           DECIMAL(12,2)   NOT NULL,
  method           ENUM('CASH','CARD','TRANSFER','DEPOSIT','ONLINE') NOT NULL,
  reference        VARCHAR(100)    NULL COMMENT 'No. de boleta o transacción',
  receipt_number   VARCHAR(30)     NOT NULL,
  receipt_file_id  BIGINT UNSIGNED NULL,
  status           ENUM('PENDING_VERIFICATION','CONFIRMED','REVERSED') NOT NULL DEFAULT 'CONFIRMED',
  paid_at          DATETIME        NOT NULL,
  received_by      BIGINT UNSIGNED NULL,
  notes            VARCHAR(500)    NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_tenant  (school_id, id),
  UNIQUE KEY uq_payments_receipt (school_id, receipt_number),
  KEY        ix_payments_student (school_id, student_id, paid_at),
  CONSTRAINT ck_payments_amount CHECK (amount > 0),
  CONSTRAINT fk_payments_student FOREIGN KEY (school_id, student_id)
    REFERENCES students (school_id, id),
  CONSTRAINT fk_payments_payer FOREIGN KEY (school_id, payer_user_id)
    REFERENCES users (school_id, id),
  CONSTRAINT fk_payments_receiver FOREIGN KEY (school_id, received_by)
    REFERENCES users (school_id, id),
  CONSTRAINT fk_payments_receipt FOREIGN KEY (school_id, receipt_file_id)
    REFERENCES files (school_id, id)
) ENGINE=InnoDB;

-- Un pago puede cubrir varios cargos y un cargo recibir varios pagos parciales.
CREATE TABLE payment_allocations (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id   BIGINT UNSIGNED NOT NULL,
  payment_id  BIGINT UNSIGNED NOT NULL,
  charge_id   BIGINT UNSIGNED NOT NULL,
  amount      DECIMAL(12,2)   NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_allocations_pair   (payment_id, charge_id),
  KEY        ix_allocations_charge (school_id, charge_id),
  CONSTRAINT ck_allocations_amount CHECK (amount > 0),
  CONSTRAINT fk_allocations_payment FOREIGN KEY (school_id, payment_id)
    REFERENCES payments (school_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_allocations_charge FOREIGN KEY (school_id, charge_id)
    REFERENCES charges (school_id, id)
) ENGINE=InnoDB;

-- =============================================================================
-- 9. OPERACIÓN: JOBS Y AUDITORÍA
-- =============================================================================

-- Idempotencia de cron: INSERT del run_key antes de ejecutar. Si ya existe,
-- otra instancia lo está corriendo o ya terminó (seguro con varias réplicas).
CREATE TABLE job_runs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id    BIGINT UNSIGNED NOT NULL,
  job_name     VARCHAR(80)     NOT NULL,
  run_key      VARCHAR(40)     NOT NULL COMMENT 'Ej. 2026-11-02 en hora local del colegio',
  status       ENUM('RUNNING','SUCCEEDED','FAILED') NOT NULL DEFAULT 'RUNNING',
  stats        JSON            NULL,
  error        TEXT            NULL,
  started_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at  DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_job_runs_key (job_name, school_id, run_key),
  CONSTRAINT fk_job_runs_school FOREIGN KEY (school_id) REFERENCES schools (id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  school_id    BIGINT UNSIGNED NOT NULL,
  actor_id     BIGINT UNSIGNED NULL COMMENT 'NULL = sistema (cron)',
  action       VARCHAR(60)     NOT NULL COMMENT 'grade.update, submission.reject, unit.close...',
  entity_type  VARCHAR(40)     NOT NULL,
  entity_id    BIGINT UNSIGNED NOT NULL,
  old_values   JSON            NULL,
  new_values   JSON            NULL,
  ip_address   VARCHAR(45)     NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_audit_entity (school_id, entity_type, entity_id),
  KEY ix_audit_time   (school_id, created_at),
  CONSTRAINT fk_audit_school FOREIGN KEY (school_id) REFERENCES schools (id)
) ENGINE=InnoDB;

-- =============================================================================
-- 10. CONSULTAS DE REFERENCIA (patrones que usarán los repositorios)
-- =============================================================================

-- a) Actividades visibles para un alumno: solo su sección y solo unidades no futuras.
--
-- SELECT a.*
-- FROM enrollments e
-- JOIN courses c         ON c.school_id = e.school_id AND c.section_id = e.section_id
-- JOIN activities a      ON a.school_id = c.school_id AND a.course_id  = c.id
-- JOIN academic_units u  ON u.school_id = a.school_id AND u.id = a.academic_unit_id
-- WHERE e.school_id  = :schoolId
--   AND e.student_id = :studentId
--   AND e.status     = 'ACTIVE'
--   AND a.status     = 'PUBLISHED'
--   AND a.deleted_at IS NULL
--   AND (a.publish_at IS NULL OR a.publish_at <= UTC_TIMESTAMP())
--   AND u.status IN ('ACTIVE','CLOSED')          -- oculta SCHEDULED
-- ORDER BY a.due_at;

-- b) Job diario de incumplimiento y correcciones pendientes (usa ix_submissions_reminders).
--
-- SELECT s.id, s.student_id, s.status, a.title, a.due_at
-- FROM submissions s
-- JOIN activities a ON a.school_id = s.school_id AND a.id = s.activity_id
-- WHERE s.school_id = :schoolId
--   AND s.status IN ('PENDING','REJECTED')
--   AND s.next_reminder_at <= UTC_TIMESTAMP()
--   AND a.status = 'PUBLISHED'
-- LIMIT 500;                                     -- procesar por lotes

-- c) Guardado masivo desde la hoja de notas (pegado o importación).
--
-- INSERT INTO grade_scores (school_id, grade_item_id, student_id, score, updated_by)
-- VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?) ...
-- ON DUPLICATE KEY UPDATE score = VALUES(score), updated_by = VALUES(updated_by);
