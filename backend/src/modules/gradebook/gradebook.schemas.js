import { z } from 'zod';
import { MAX_CELLS_PER_SAVE } from './gradebook.rules.js';

const id = z.coerce.number().int().positive();
const score = z.number().min(0).max(999.99);

export const courseParams = z.object({ courseId: id });
export const itemParams = z.object({ itemId: id });
export const importParams = z.object({ importId: id });

export const sheetQuery = z.object({ unitId: id.optional() });

export const templateQuery = z.object({
  unitId: id,
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
});

export const importBody = z.object({ unitId: id });

export const createItemBody = z.object({
  unitId: id,
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  maxScore: score.positive('La nota máxima debe ser mayor que 0'),
  weight: z.number().min(0).max(100).default(0),
});

export const updateItemBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    maxScore: score.positive(),
    weight: z.number().min(0).max(100),
    isPublished: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'No hay cambios');

export const deleteItemQuery = z.object({
  force: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

// El rango por columna (0..maxScore) se valida en el servicio, que conoce cada columna
export const saveScoresBody = z.object({
  unitId: id,
  cells: z
    .array(
      z.object({
        gradeItemId: id,
        studentId: id,
        score: z.number().nullable(),
      }),
    )
    .min(1)
    .max(MAX_CELLS_PER_SAVE, `Máximo ${MAX_CELLS_PER_SAVE} celdas por guardado`),
});

// Mejora de una nota (aunque esté aprobada). El rango se valida en el servicio.
export const improveBody = z.object({
  unitId: id,
  gradeItemId: id,
  studentId: id,
  score: z.number().nullable(),
  note: z.string().trim().max(255).nullable().optional(),
});

export const historyQuery = z.object({ gradeItemId: id, studentId: id });
