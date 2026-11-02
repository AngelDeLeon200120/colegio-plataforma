import { z } from 'zod';

const id = z.coerce.number().int().positive();

export const activityParams = z.object({ activityId: id });

// Familias: qué hijo o hija. Estudiantes: se ignora (siempre es uno mismo).
export const viewerQuery = z.object({ studentId: id.optional() });

export const submitBody = z.object({
  comment: z
    .string()
    .trim()
    .max(2000, 'El comentario admite hasta 2000 caracteres')
    .optional()
    .transform((value) => value || null),
});
