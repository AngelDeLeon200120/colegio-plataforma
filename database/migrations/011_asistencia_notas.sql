-- =============================================================================
-- Migración 011 — Nota por alumno y día en la asistencia
--
-- El docente puede anotar algo del día (p. ej. "Llegó tarde"). No cambia la calificación.
-- Solo agrega una columna. Se aplica UNA sola vez. Requiere la migración 010.
-- =============================================================================

USE colegio_saas;

ALTER TABLE attendance_records
  ADD COLUMN note VARCHAR(200) NULL COMMENT 'Ej. Llegó tarde' AFTER status;
