-- Datos de desarrollo. NO usar en producción.
-- Colegio 1: profesora Lucía Méndez (user 2) con "3ro B · Matemáticas" y 6 entregas en distintos estados.
-- Colegio 2: existe solo para probar el aislamiento entre tenants.
-- Contraseña de todos los usuarios de desarrollo: Colegio2026!  (hash scrypt generado con `npm run hash`)

USE colegio_saas;
SET NAMES utf8mb4;
SET @dev_hash = 'scrypt$131072$8$1$VGzG7uP-ovp6QukgahMaFw$Lum8Ji5PJRW6bYguCZfB2Jk1UqJ2BUKo0pa6UfZTnUY6Q-c--N6BBN-_6VGFkKGXsse7Nji7rl7CDUakTBBckA';

INSERT INTO schools (id, name, slug, status) VALUES
  (1, 'Colegio Demo', 'demo', 'ACTIVE'),
  (2, 'Colegio Vecino', 'vecino', 'ACTIVE');

INSERT INTO users (id, school_id, email, password_hash, first_name, last_name, role) VALUES
  (1,  1, 'admin@demo.edu',    @dev_hash, 'Rosa',     'Herrera',  'ADMIN'),
  (2,  1, 'lucia@demo.edu',    @dev_hash, 'Lucía',    'Méndez',   'TEACHER'),
  (3,  1, 'mario.lopez@mail.com', @dev_hash, 'Mario', 'López',    'PARENT'),
  (4,  1, 'ana@demo.edu',      @dev_hash, 'Ana',      'López',    'STUDENT'),
  (5,  1, 'bruno@demo.edu',    @dev_hash, 'Bruno',    'Castillo', 'STUDENT'),
  (6,  1, 'camila@demo.edu',   @dev_hash, 'Camila',   'Ruiz',     'STUDENT'),
  (7,  1, 'diego@demo.edu',    @dev_hash, 'Diego',    'Morales',  'STUDENT'),
  (8,  1, 'elena@demo.edu',    @dev_hash, 'Elena',    'Pérez',    'STUDENT'),
  (9,  1, 'fernando@demo.edu', @dev_hash, 'Fernando', 'Soto',     'STUDENT'),
  (20, 2, 'profe@vecino.edu',  @dev_hash, 'Pablo',    'Ajú',      'TEACHER');

INSERT INTO academic_years (id, school_id, name, starts_on, ends_on, status) VALUES
  (1, 1, '2026', '2026-01-12', '2026-11-27', 'ACTIVE');

INSERT INTO academic_units (id, school_id, academic_year_id, sequence_no, name, starts_on, ends_on, status, activated_at, closed_at, closed_by) VALUES
  (1, 1, 1, 3, 'Unidad III', '2026-06-01', '2026-08-28', 'CLOSED', '2026-06-01 06:00:00', '2026-08-29 00:00:00', 1),
  (2, 1, 1, 4, 'Unidad IV',  '2026-08-31', '2026-11-27', 'ACTIVE', '2026-08-31 06:00:00', NULL, NULL);

INSERT INTO grade_levels (id, school_id, name, short_name, education_level, sort_order) VALUES
  (1, 1, 'Tercero Primaria', '3ro', 'Primaria', 3);

INSERT INTO sections (id, school_id, academic_year_id, grade_level_id, name, homeroom_teacher_id) VALUES
  (1, 1, 1, 1, 'B', 2);

INSERT INTO subjects (id, school_id, code, name, color) VALUES
  (1, 1, 'MAT', 'Matemáticas', '#2563eb');

INSERT INTO courses (id, school_id, section_id, subject_id, teacher_id) VALUES
  (1, 1, 1, 1, 2);

INSERT INTO students (id, school_id, user_id, student_code, first_name, last_name) VALUES
  (1, 1, 4, 'A001', 'Ana',      'López'),
  (2, 1, 5, 'A002', 'Bruno',    'Castillo'),
  (3, 1, 6, 'A003', 'Camila',   'Ruiz'),
  (4, 1, 7, 'A004', 'Diego',    'Morales'),
  (5, 1, 8, 'A005', 'Elena',    'Pérez'),
  (6, 1, 9, 'A006', 'Fernando', 'Soto');

INSERT INTO guardian_students (school_id, guardian_id, student_id, relationship, is_primary, is_financial_responsible) VALUES
  (1, 3, 1, 'FATHER', TRUE, TRUE);

INSERT INTO enrollments (school_id, student_id, section_id, academic_year_id, enrolled_on) VALUES
  (1, 1, 1, 1, '2026-01-12'), (1, 2, 1, 1, '2026-01-12'), (1, 3, 1, 1, '2026-01-12'),
  (1, 4, 1, 1, '2026-01-12'), (1, 5, 1, 1, '2026-01-12'), (1, 6, 1, 1, '2026-01-12');

-- Vence el 30/10 a las 23:59 hora de Guatemala (UTC-6)
INSERT INTO activities (id, school_id, course_id, academic_unit_id, created_by, title, description, type, status, max_score, due_at) VALUES
  (1, 1, 1, 2, 2, 'Guía de fracciones equivalentes',
   'Resuelve los 10 ejercicios de la guía mostrando el procedimiento completo. Sube una foto legible o un PDF.',
   'TASK', 'PUBLISHED', 20.00, '2026-10-31 05:59:00');

INSERT INTO files (id, school_id, uploaded_by, provider, storage_key, original_name, mime_type, size_bytes, purpose) VALUES
  (1, 1, 4, 'LOCAL', 'schools/1/submissions/0b8e1c.pdf', 'fracciones_ana.pdf',          'application/pdf', 284311, 'SUBMISSION'),
  (2, 1, 4, 'LOCAL', 'schools/1/submissions/5f2a9d.pdf', 'fracciones_ana_corregido.pdf', 'application/pdf', 312904, 'SUBMISSION'),
  (3, 1, 4, 'LOCAL', 'schools/1/submissions/7c1d22.jpg', 'ejercicio_4.jpg',             'image/jpeg',      1048210, 'SUBMISSION'),
  (4, 1, 5, 'LOCAL', 'schools/1/submissions/a91f03.pdf', 'Guia-Bruno.pdf',              'application/pdf', 198442, 'SUBMISSION'),
  (5, 1, 6, 'LOCAL', 'schools/1/submissions/c3e8b7.jpg', 'IMG_2041.jpg',                'image/jpeg',      2211980, 'SUBMISSION'),
  (6, 1, 8, 'LOCAL', 'schools/1/submissions/d47a50.pdf', 'elena_perez_fracciones.pdf',  'application/pdf', 256001, 'SUBMISSION'),
  (7, 1, 9, 'LOCAL', 'schools/1/submissions/e9b6f1.pdf', 'tarea fracciones.pdf',        'application/pdf', 143770, 'SUBMISSION');

-- version: +1 por cada cambio de estado (entrega o revisión)
INSERT INTO submissions (id, school_id, activity_id, student_id, status, attempt_count, last_submitted_at, is_late, score, last_feedback, reviewed_by, reviewed_at, next_reminder_at, reminder_count, version) VALUES
  (1, 1, 1, 1, 'SUBMITTED', 2, '2026-11-01 22:14:00', TRUE,  NULL, 'Falta el procedimiento en los ejercicios 3 y 4. Recuerda simplificar hasta la mínima expresión.', 2, '2026-10-31 15:20:00', NULL, 0, 3),
  (2, 1, 1, 2, 'SUBMITTED', 1, '2026-10-30 19:02:00', FALSE, NULL, NULL, NULL, NULL, NULL, 0, 1),
  (3, 1, 1, 3, 'REJECTED',  1, '2026-10-29 23:40:00', FALSE, NULL, 'La foto está borrosa y no se leen los ejercicios 6 a 10. Vuelve a subirla con buena luz.', 2, '2026-10-31 15:35:00', '2026-11-02 15:35:00', 1, 2),
  (4, 1, 1, 4, 'PENDING',   0, NULL, FALSE, NULL, NULL, NULL, NULL, '2026-10-31 05:59:00', 2, 0),
  (5, 1, 1, 5, 'APPROVED',  1, '2026-10-28 21:10:00', FALSE, 18.50, '¡Muy buen trabajo! Solo revisa el ejercicio 9.', 2, '2026-10-31 15:50:00', NULL, 0, 2),
  (6, 1, 1, 6, 'SUBMITTED', 1, '2026-11-02 01:30:00', TRUE,  NULL, NULL, NULL, NULL, NULL, 0, 1);

INSERT INTO submission_attempts (id, school_id, submission_id, attempt_number, student_comment, submitted_by, is_late, submitted_at) VALUES
  (1, 1, 1, 1, NULL, 4, FALSE, '2026-10-30 20:05:00'),
  (2, 1, 1, 2, 'Profe, ya agregué el procedimiento del 3 y 4 en hojas aparte.', 4, TRUE, '2026-11-01 22:14:00'),
  (3, 1, 2, 1, NULL, 5, FALSE, '2026-10-30 19:02:00'),
  (4, 1, 3, 1, 'Lo hice en el cuaderno.', 6, FALSE, '2026-10-29 23:40:00'),
  (5, 1, 5, 1, NULL, 8, FALSE, '2026-10-28 21:10:00'),
  (6, 1, 6, 1, 'Disculpe la tardanza, estuve enfermo.', 9, TRUE, '2026-11-02 01:30:00');

INSERT INTO submission_attempt_files (school_id, attempt_id, file_id) VALUES
  (1, 1, 1), (1, 2, 2), (1, 2, 3), (1, 3, 4), (1, 4, 5), (1, 5, 6), (1, 6, 7);

INSERT INTO submission_reviews (school_id, submission_id, attempt_id, reviewer_id, decision, feedback, score, created_at) VALUES
  (1, 1, 1, 2, 'REJECTED', 'Falta el procedimiento en los ejercicios 3 y 4. Recuerda simplificar hasta la mínima expresión.', NULL, '2026-10-31 15:20:00'),
  (1, 3, 4, 2, 'REJECTED', 'La foto está borrosa y no se leen los ejercicios 6 a 10. Vuelve a subirla con buena luz.', NULL, '2026-10-31 15:35:00'),
  (1, 5, 5, 2, 'APPROVED', '¡Muy buen trabajo! Solo revisa el ejercicio 9.', 18.50, '2026-10-31 15:50:00');

-- Cuadro de notas de 3ro B · Matemáticas
-- Unidad IV (activa): editable. La columna 1 está ligada a la actividad de la guía.
INSERT INTO grade_items (id, school_id, course_id, academic_unit_id, activity_id, name, max_score, weight, sort_order, is_published, created_by) VALUES
  (1, 1, 1, 2, 1,    'Guía de fracciones', 20.00,  20.00, 1, TRUE,  2),
  (2, 1, 1, 2, NULL, 'Hoja de trabajo 1',  10.00,  10.00, 2, TRUE,  2),
  (3, 1, 1, 2, NULL, 'Examen parcial',     100.00, 40.00, 3, FALSE, 2),
  (4, 1, 1, 2, NULL, 'Participación',      10.00,  10.00, 4, FALSE, 2),
-- Unidad III (cerrada): solo lectura
  (5, 1, 1, 1, NULL, 'Proyecto final',     100.00, 50.00, 1, TRUE,  2),
  (6, 1, 1, 1, NULL, 'Examen final',       100.00, 50.00, 2, TRUE,  2);

INSERT INTO grade_scores (school_id, grade_item_id, student_id, score, updated_by) VALUES
  (1, 1, 5, 18.50, 2),
  (1, 2, 1, 9.00, 2), (1, 2, 2, 8.50, 2), (1, 2, 3, 7.00, 2), (1, 2, 4, 6.00, 2), (1, 2, 5, 10.00, 2), (1, 2, 6, 8.00, 2),
  (1, 3, 1, 78.00, 2), (1, 3, 2, 85.00, 2), (1, 3, 3, 62.00, 2), (1, 3, 5, 94.00, 2), (1, 3, 6, 71.00, 2),
  (1, 5, 1, 88.00, 2), (1, 5, 2, 76.00, 2), (1, 5, 3, 69.00, 2), (1, 5, 4, 58.00, 2), (1, 5, 5, 95.00, 2), (1, 5, 6, 80.00, 2),
  (1, 6, 1, 82.00, 2), (1, 6, 2, 79.00, 2), (1, 6, 3, 74.00, 2), (1, 6, 4, 61.00, 2), (1, 6, 5, 97.00, 2), (1, 6, 6, 77.00, 2);

-- Más actividades para la vista de estudiantes y familias (fechas en UTC)
--  2: pendiente, vence en el futuro
--  3: borrador (no debe verse)
--  4: de la Unidad III cerrada, aprobada (historial)
--  5: vencida y sin entregas tardías (no se puede entregar)
--  6: publicación programada para el futuro (no debe verse todavía)
INSERT INTO activities (id, school_id, course_id, academic_unit_id, created_by, title, description, type, status, allow_late, max_score, publish_at, due_at) VALUES
  (2, 1, 1, 2, 2, 'Problemas de multiplicación',
   'Resuelve los problemas 1 al 8 de la página 54. Escribe la operación y la respuesta completa.',
   'TASK', 'PUBLISHED', TRUE, 10.00, NULL, '2026-11-10 05:59:00'),
  (3, 1, 1, 2, 2, 'Proyecto: tienda escolar', 'Borrador en preparación.', 'PROJECT', 'DRAFT', TRUE, 20.00, NULL, '2026-11-20 05:59:00'),
  (4, 1, 1, 1, 2, 'Maqueta de figuras geométricas', 'Construye una maqueta con al menos 5 figuras.', 'PROJECT', 'PUBLISHED', TRUE, 20.00, NULL, '2026-08-14 05:59:00'),
  (5, 1, 1, 2, 2, 'Quiz de fracciones', 'Responde el quiz y sube una foto de tu hoja.', 'EXAM', 'PUBLISHED', FALSE, 10.00, NULL, '2026-10-29 05:59:00'),
  (6, 1, 1, 2, 2, 'Repaso para el examen final', 'Se publica la próxima semana.', 'PRACTICE', 'PUBLISHED', TRUE, NULL, '2026-12-01 12:00:00', '2026-12-05 05:59:00');

INSERT INTO submissions (school_id, activity_id, student_id, status, next_reminder_at) VALUES
  (1, 2, 1, 'PENDING', '2026-11-10 05:59:00'), (1, 2, 2, 'PENDING', '2026-11-10 05:59:00'), (1, 2, 3, 'PENDING', '2026-11-10 05:59:00'),
  (1, 2, 4, 'PENDING', '2026-11-10 05:59:00'), (1, 2, 5, 'PENDING', '2026-11-10 05:59:00'), (1, 2, 6, 'PENDING', '2026-11-10 05:59:00'),
  (1, 5, 1, 'PENDING', '2026-10-29 05:59:00'), (1, 5, 3, 'PENDING', '2026-10-29 05:59:00');

INSERT INTO submissions (id, school_id, activity_id, student_id, status, attempt_count, last_submitted_at, score, last_feedback, reviewed_by, reviewed_at, version) VALUES
  (20, 1, 4, 1, 'APPROVED', 1, '2026-08-13 22:00:00', 19.00, 'Excelente trabajo y muy bien presentado.', 2, '2026-08-15 16:00:00', 2),
  (21, 1, 4, 3, 'APPROVED', 1, '2026-08-13 21:00:00', 16.00, NULL, 2, '2026-08-15 16:10:00', 2);

INSERT INTO submission_attempts (id, school_id, submission_id, attempt_number, submitted_by, submitted_at) VALUES
  (20, 1, 20, 1, 4, '2026-08-13 22:00:00'),
  (21, 1, 21, 1, 6, '2026-08-13 21:00:00');

INSERT INTO submission_reviews (school_id, submission_id, attempt_id, reviewer_id, decision, feedback, score, created_at) VALUES
  (1, 20, 20, 2, 'APPROVED', 'Excelente trabajo y muy bien presentado.', 19.00, '2026-08-15 16:00:00'),
  (1, 21, 21, 2, 'APPROVED', NULL, 16.00, '2026-08-15 16:10:00');

-- Camila también tiene encargada (para probar el selector de hijos de una familia con dos estudiantes)
INSERT INTO guardian_students (school_id, guardian_id, student_id, relationship, is_primary, is_financial_responsible) VALUES
  (1, 3, 3, 'GUARDIAN', FALSE, TRUE);

-- =============================================================================
-- Finanzas (moneda GTQ). Mario es encargado financiero de Ana y de Camila.
--  Ana:    inscripción y enero–septiembre pagados; octubre VENCIDO; noviembre pendiente (vence el 5)
--  Camila: inscripción y enero–octubre pagados; noviembre pendiente; bus de noviembre con abono parcial
--  Bruno:  inscripción pagada; octubre VENCIDO; noviembre pendiente
-- =============================================================================
INSERT INTO fee_concepts (id, school_id, code, name, default_amount, is_recurring) VALUES
  (1, 1, 'INSCR', 'Inscripción', 900.00, FALSE),
  (2, 1, 'COLEG', 'Colegiatura', 650.00, TRUE),
  (3, 1, 'BUS',   'Transporte escolar', 250.00, TRUE);

INSERT INTO charges (id, school_id, student_id, academic_year_id, fee_concept_id, period_label, description, amount, paid_amount, due_date, status) VALUES
  (1,  1, 1, 1, 1, 'UNICO',   'Inscripción 2026',      900.00, 900.00, '2026-01-10', 'PAID'),
  (2,  1, 1, 1, 2, '2026-01', 'Colegiatura enero',      650.00, 650.00, '2026-01-05', 'PAID'),
  (3,  1, 1, 1, 2, '2026-02', 'Colegiatura febrero',    650.00, 650.00, '2026-02-05', 'PAID'),
  (4,  1, 1, 1, 2, '2026-03', 'Colegiatura marzo',      650.00, 650.00, '2026-03-05', 'PAID'),
  (5,  1, 1, 1, 2, '2026-04', 'Colegiatura abril',      650.00, 650.00, '2026-04-05', 'PAID'),
  (6,  1, 1, 1, 2, '2026-05', 'Colegiatura mayo',       650.00, 650.00, '2026-05-05', 'PAID'),
  (7,  1, 1, 1, 2, '2026-06', 'Colegiatura junio',      650.00, 650.00, '2026-06-05', 'PAID'),
  (8,  1, 1, 1, 2, '2026-07', 'Colegiatura julio',      650.00, 650.00, '2026-07-05', 'PAID'),
  (9,  1, 1, 1, 2, '2026-08', 'Colegiatura agosto',     650.00, 650.00, '2026-08-05', 'PAID'),
  (10, 1, 1, 1, 2, '2026-09', 'Colegiatura septiembre', 650.00, 650.00, '2026-09-05', 'PAID'),
  (11, 1, 1, 1, 2, '2026-10', 'Colegiatura octubre',    650.00,   0.00, '2026-10-05', 'OVERDUE'),
  (12, 1, 1, 1, 2, '2026-11', 'Colegiatura noviembre',  650.00,   0.00, '2026-11-05', 'PENDING'),
  (13, 1, 3, 1, 1, 'UNICO',   'Inscripción 2026',      900.00, 900.00, '2026-01-10', 'PAID'),
  (14, 1, 3, 1, 2, '2026-01', 'Colegiatura enero',      650.00, 650.00, '2026-01-05', 'PAID'),
  (15, 1, 3, 1, 2, '2026-02', 'Colegiatura febrero',    650.00, 650.00, '2026-02-05', 'PAID'),
  (16, 1, 3, 1, 2, '2026-03', 'Colegiatura marzo',      650.00, 650.00, '2026-03-05', 'PAID'),
  (17, 1, 3, 1, 2, '2026-04', 'Colegiatura abril',      650.00, 650.00, '2026-04-05', 'PAID'),
  (18, 1, 3, 1, 2, '2026-05', 'Colegiatura mayo',       650.00, 650.00, '2026-05-05', 'PAID'),
  (19, 1, 3, 1, 2, '2026-06', 'Colegiatura junio',      650.00, 650.00, '2026-06-05', 'PAID'),
  (20, 1, 3, 1, 2, '2026-07', 'Colegiatura julio',      650.00, 650.00, '2026-07-05', 'PAID'),
  (21, 1, 3, 1, 2, '2026-08', 'Colegiatura agosto',     650.00, 650.00, '2026-08-05', 'PAID'),
  (22, 1, 3, 1, 2, '2026-09', 'Colegiatura septiembre', 650.00, 650.00, '2026-09-05', 'PAID'),
  (23, 1, 3, 1, 2, '2026-10', 'Colegiatura octubre',    650.00, 650.00, '2026-10-05', 'PAID'),
  (24, 1, 3, 1, 2, '2026-11', 'Colegiatura noviembre',  650.00,   0.00, '2026-11-05', 'PENDING'),
  (25, 1, 3, 1, 3, '2026-11', 'Transporte noviembre',   250.00, 100.00, '2026-11-05', 'PARTIAL'),
  (26, 1, 2, 1, 1, 'UNICO',   'Inscripción 2026',      900.00, 900.00, '2026-01-10', 'PAID'),
  (27, 1, 2, 1, 2, '2026-10', 'Colegiatura octubre',    650.00,   0.00, '2026-10-05', 'OVERDUE'),
  (28, 1, 2, 1, 2, '2026-11', 'Colegiatura noviembre',  650.00,   0.00, '2026-11-05', 'PENDING');

INSERT INTO payments (id, school_id, student_id, payer_user_id, amount, method, reference, receipt_number, paid_at, received_by) VALUES
  (1, 1, 1, 3, 900.00,  'TRANSFER', 'BI-778120', 'R-2026-000001', '2026-01-08 15:10:00', 1),
  (2, 1, 1, 3, 1950.00, 'CASH',     NULL,        'R-2026-000002', '2026-01-15 16:00:00', 1),
  (3, 1, 1, 3, 1950.00, 'CARD',     'VISA-4411', 'R-2026-000003', '2026-04-03 17:30:00', 1),
  (4, 1, 1, 3, 1950.00, 'TRANSFER', 'BI-902233', 'R-2026-000004', '2026-07-02 14:45:00', 1),
  (5, 1, 3, 3, 900.00,  'TRANSFER', 'BI-778121', 'R-2026-000005', '2026-01-08 15:12:00', 1),
  (6, 1, 3, 3, 3900.00, 'DEPOSIT',  'BAM-55102', 'R-2026-000006', '2026-01-20 18:00:00', 1),
  (7, 1, 3, 3, 2600.00, 'TRANSFER', 'BI-913400', 'R-2026-000007', '2026-07-03 15:00:00', 1),
  (8, 1, 3, 3, 100.00,  'CASH',     NULL,        'R-2026-000008', '2026-11-01 16:20:00', 1),
  (9, 1, 2, NULL, 900.00, 'CASH',   NULL,        'R-2026-000009', '2026-01-09 15:00:00', 1);

INSERT INTO payment_allocations (school_id, payment_id, charge_id, amount) VALUES
  (1, 1, 1, 900.00),
  (1, 2, 2, 650.00), (1, 2, 3, 650.00), (1, 2, 4, 650.00),
  (1, 3, 5, 650.00), (1, 3, 6, 650.00), (1, 3, 7, 650.00),
  (1, 4, 8, 650.00), (1, 4, 9, 650.00), (1, 4, 10, 650.00),
  (1, 5, 13, 900.00),
  (1, 6, 14, 650.00), (1, 6, 15, 650.00), (1, 6, 16, 650.00), (1, 6, 17, 650.00), (1, 6, 18, 650.00), (1, 6, 19, 650.00),
  (1, 7, 20, 650.00), (1, 7, 21, 650.00), (1, 7, 22, 650.00), (1, 7, 23, 650.00),
  (1, 8, 25, 100.00),
  (1, 9, 26, 900.00);
