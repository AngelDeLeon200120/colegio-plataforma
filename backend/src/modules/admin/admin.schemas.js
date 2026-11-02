import { z } from 'zod';

const id = z.coerce.number().int().positive();
const name = z.string().trim().min(1, 'Obligatorio').max(80);
const email = z.string().trim().toLowerCase().email('Correo inválido').max(190);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || null);

export const idParams = z.object({ id });
export const studentGuardianParams = z.object({ id, guardianId: id });

// --- Usuarios ----------------------------------------------------------------
export const listUsersQuery = z.object({
  role: z.enum(['TEACHER', 'PARENT', 'ADMIN']).optional(),
  q: z.string().trim().max(60).optional(),
});

export const createUserBody = z.object({
  role: z.enum(['TEACHER', 'PARENT', 'ADMIN']),
  firstName: name,
  lastName: name,
  email,
  phone: optionalText(30),
});

export const updateUserBody = z
  .object({ firstName: name, lastName: name, email, phone: z.string().trim().max(30).nullable(), status: z.enum(['ACTIVE', 'DISABLED']) })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'No hay cambios');

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Mínimo 8 caracteres').max(200),
});

// --- Estudiantes -------------------------------------------------------------
export const listStudentsQuery = z.object({ q: z.string().trim().max(60).optional(), sectionId: id.optional() });

export const createStudentBody = z.object({
  code: z.string().trim().min(1, 'Obligatorio').max(30),
  firstName: name,
  lastName: name,
  birthDate: isoDate.optional(),
  email: email.optional().or(z.literal('').transform(() => undefined)), // con correo se le crea cuenta
  sectionId: id.optional(),
});

export const updateStudentBody = z
  .object({
    code: z.string().trim().min(1).max(30),
    firstName: name,
    lastName: name,
    birthDate: isoDate.nullable(),
    status: z.enum(['ACTIVE', 'WITHDRAWN', 'GRADUATED']),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'No hay cambios');

export const studentAccountBody = z.object({ email });
export const enrollmentBody = z.object({ sectionId: id.nullable() }); // null = retirar

export const guardianBody = z.object({
  guardianId: id,
  relationship: z.enum(['MOTHER', 'FATHER', 'GUARDIAN', 'OTHER']),
  isFinancialResponsible: z.boolean().default(false),
  receivesNotifications: z.boolean().default(true),
});

// --- Estructura académica ----------------------------------------------------
export const unitBody = z.object({ name: z.string().trim().min(1).max(60), startsOn: isoDate, endsOn: isoDate });
export const unitActionParams = z.object({ id, action: z.enum(['activate', 'close', 'reopen']) });
export const gradeLevelBody = z.object({
  name: z.string().trim().min(1).max(60),
  shortName: z.string().trim().min(1).max(15),
  educationLevel: optionalText(40),
});
export const sectionBody = z.object({ gradeLevelId: id, name: z.string().trim().min(1).max(10), homeroomTeacherId: id.optional() });
export const subjectBody = z.object({
  code: z.string().trim().toUpperCase().min(1).max(20),
  name: z.string().trim().min(1).max(100),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export const courseBody = z.object({ sectionId: id, subjectId: id, teacherId: id });
export const updateCourseBody = z
  .object({ teacherId: id, isActive: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'No hay cambios');
