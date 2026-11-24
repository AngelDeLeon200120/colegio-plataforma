-- =============================================================================
-- Migración 009 — Asistencia como columna fija del cuadro de notas
--
-- Cuadro por defecto: Asistencia (10 puntos, dentro del Total), Total, Parcial,
-- Evaluación y Nota final. La columna se crea sola al abrir el cuadro de una unidad
-- que usa Parcial y Evaluación. Solo agrega un valor al ENUM; se puede repetir.
-- Requiere la migración 008.
-- =============================================================================

USE colegio_saas;

ALTER TABLE grade_items
  MODIFY COLUMN kind ENUM('REGULAR','PARTIAL','EVALUATION','ATTENDANCE') NOT NULL DEFAULT 'REGULAR' COMMENT 'Columna normal o fija (parcial, evaluación, asistencia)';
