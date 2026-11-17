-- =============================================================================
-- Migración 004 — Etapa de cada reporte de conducta
--
--   1.er reporte del ciclo → AVISO          (la familia recibe el aviso)
--   2.º reporte            → ESCRITO        (reporte escrito formal; se notifica a la familia)
--   3.er reporte           → REUNION        (la institución cita a reunión con tutores o familia)
--   (y se repite: 4.º aviso, 5.º escrito, 6.º reunión...)
--
-- Solo agrega una columna que admite NULL (los reportes anteriores quedan sin etapa).
-- Se puede aplicar más de una vez: si la columna ya existe, no hace nada.
-- =============================================================================

USE colegio_saas;

SET @exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'conduct_reports' AND column_name = 'stage'
);
SET @sql := IF(@exists = 0,
  "ALTER TABLE conduct_reports ADD COLUMN stage ENUM('AVISO','ESCRITO','REUNION') NULL COMMENT 'Etapa con la que se notificó a la familia' AFTER description",
  'SELECT 1');
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;
