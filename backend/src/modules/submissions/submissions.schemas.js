import { z } from 'zod';
import { SubmissionStatus } from './submission.stateMachine.js';

const id = z.coerce.number().int().positive();
const version = z.number().int().min(0);
const optionalText = z
  .string()
  .trim()
  .max(5000)
  .nullish()
  .transform((value) => value || null);

export const activityParams = z.object({ activityId: id });
export const submissionParams = z.object({ submissionId: id });

export const listQuery = z.object({
  status: z.nativeEnum(SubmissionStatus).optional(),
});

export const approveBody = z.object({
  score: z.number().min(0).max(999.99).nullable().default(null),
  feedback: optionalText,
  version,
});

export const rejectBody = z.object({
  feedback: z.string().trim().min(5, 'El comentario de corrección es obligatorio (mínimo 5 caracteres)').max(5000),
  version,
});
