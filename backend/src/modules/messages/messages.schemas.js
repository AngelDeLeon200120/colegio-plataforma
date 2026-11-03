import { z } from 'zod';

const id = z.coerce.number().int().positive();

export const TOPICS = ['TAREAS', 'AUSENCIA'];
export const ABSENCE_REASONS = ['LLEGA_TARDE', 'SIN_UNIFORME', 'VACACIONES', 'FALLECIMIENTO', 'ENFERMEDAD'];

const body = z.string().trim().min(1, 'Escribe el mensaje').max(5000);

export const threadParams = z.object({ threadId: id });

export const listQuery = z.object({
  topic: z.enum(TOPICS).optional(),
  reason: z.enum(ABSENCE_REASONS).optional(),
});

export const createBody = z
  .object({
    scope: z.enum(['STUDENT', 'SECTION']).default('STUDENT'),
    studentId: id.optional(),
    sectionId: id.optional(),
    topic: z.enum(TOPICS),
    reason: z.enum(ABSENCE_REASONS).optional(),
    subject: z.string().trim().min(3, 'El asunto debe tener al menos 3 caracteres').max(200),
    body,
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'STUDENT' && !value.studentId) ctx.addIssue({ code: 'custom', path: ['studentId'], message: 'Indica el estudiante' });
    if (value.scope === 'SECTION' && !value.sectionId) ctx.addIssue({ code: 'custom', path: ['sectionId'], message: 'Indica la sección' });
    if (value.topic === 'AUSENCIA' && !value.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Indica el motivo de la ausencia' });
  })
  .transform((value) => ({ ...value, reason: value.topic === 'AUSENCIA' ? value.reason : null }));

export const replyBody = z.object({ body });
