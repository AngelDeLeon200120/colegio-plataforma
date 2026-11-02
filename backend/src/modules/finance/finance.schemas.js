import { z } from 'zod';

const id = z.coerce.number().int().positive();
const money = z.number().min(0).max(9_999_999.99);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');

export const studentParams = z.object({ studentId: id });
export const chargeParams = z.object({ chargeId: id });
export const paymentParams = z.object({ paymentId: id });
export const conceptParams = z.object({ conceptId: id });

export const familyQuery = z.object({ studentId: id });
export const portfolioQuery = z.object({ q: z.string().trim().max(60).optional() });

export const createConceptBody = z.object({
  code: z.string().trim().toUpperCase().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  defaultAmount: money,
  isRecurring: z.boolean().default(false),
});

export const updateConceptBody = z
  .object({ name: z.string().trim().min(1).max(100), defaultAmount: money, isRecurring: z.boolean(), isActive: z.boolean() })
  .partial();

export const generateChargesBody = z.object({
  feeConceptId: id,
  periodLabel: z.string().trim().min(1).max(20),
  description: z.string().trim().min(1).max(200),
  amount: money.positive().optional(), // por defecto, el monto del concepto
  dueDate: isoDate,
  sectionIds: z.array(id).max(200).optional(),
});

export const adjustChargeBody = z
  .object({ discount: money, lateFee: money })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'No hay cambios');

export const createPaymentBody = z.object({
  studentId: id,
  amount: money.positive('El monto debe ser mayor que 0'),
  method: z.enum(['CASH', 'CARD', 'TRANSFER', 'DEPOSIT', 'ONLINE']),
  reference: z.string().trim().max(100).optional().transform((value) => value || null),
  paidAt: z.coerce.date().optional(),
  notes: z.string().trim().max(500).optional().transform((value) => value || null),
  // Sin asignaciones: se aplica a los cargos más antiguos
  allocations: z.array(z.object({ chargeId: id, amount: money.positive() })).max(50).optional(),
});

export const reversePaymentBody = z.object({
  reason: z.string().trim().min(5, 'Indica el motivo (mínimo 5 caracteres)').max(300),
});
