-- =============================================================================
-- Migración 008 — Parcial, Evaluación y Nota final en el cuadro de notas
--
-- El Total de actividades llega hasta 70 puntos; Parcial (10) y Evaluación (20) son dos
-- columnas fijas con puntos editables, y la Nota final es la suma de las tres (sobre 100).
-- Las unidades que ya estaban cerradas conservan su cálculo anterior, aunque se reabran.
-- Solo agrega columnas. Se aplica UNA sola vez.
-- =============================================================================

USE colegio_saas;

ALTER TABLE academic_units
  ADD COLUMN exam_columns BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Usa Parcial, Evaluación y Nota final' AFTER status;

UPDATE academic_units SET exam_columns = FALSE WHERE status = 'CLOSED';

ALTER TABLE grade_items
  ADD COLUMN kind ENUM('REGULAR','PARTIAL','EVALUATION') NOT NULL DEFAULT 'REGULAR' COMMENT 'Columna normal, parcial o evaluación' AFTER activity_id,
  ADD COLUMN exam_kind VARCHAR(12) GENERATED ALWAYS AS (IF(kind = 'REGULAR', NULL, kind)) STORED AFTER kind,
  ADD UNIQUE KEY uq_grade_items_exam (course_id, academic_unit_id, exam_kind);
