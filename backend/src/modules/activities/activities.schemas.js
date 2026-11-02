import { z } from 'zod';

const id = z.coerce.number().int().positive();
// Llegan como texto en el multipart: se convierten aquí
const booleanField = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);

export const ACTIVITY_TYPES = ['TASK', 'PROJECT', 'EXAM', 'READING', 'PRACTICE'];

export const activityParams = z.object({ activityId: id });
export const courseParams = z.object({ courseId: id });

export const listQuery = z.object({
  courseId: id.optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).optional(),
});

export const createBody = z.object({
  title: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres').max(200),
  description: optionalText(5000),
  type: z.enum(ACTIVITY_TYPES).default('TASK'),
  unitId: id.optional(), // por defecto, la unidad activa
  dueAt: z.coerce.date().optional(),
  maxScore: z.coerce.number().positive().max(999.99).optional(),
  allowLate: booleanField.default(true),
  publish: booleanField.default(false),
  // Con peso: crea la columna ligada en el cuadro de notas (requiere maxScore)
  gradeWeight: z.coerce.number().min(0).max(100).optional(),
});

export const updateBody = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(5000).nullable(),
    dueAt: z.coerce.date().nullable(),
    allowLate: z.boolean(),
    maxScore: z.number().positive().max(999.99).nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'No hay cambios');
