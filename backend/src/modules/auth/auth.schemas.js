import { z } from 'zod';

export const loginBody = z.object({
  schoolSlug: z.string().trim().toLowerCase().min(1, 'Indica el código del colegio').max(60),
  email: z.string().trim().toLowerCase().email('Correo inválido').max(190),
  password: z.string().min(1, 'Indica tu contraseña').max(200),
});
