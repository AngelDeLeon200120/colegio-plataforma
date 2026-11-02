// Sesión simulada para `npm run dev:mocks`. Acepta cualquier contraseña no vacía
// para los usuarios del seed; la sesión dura lo que la pestaña (sessionStorage).
import { ApiError } from '@/lib/apiClient';

const KEY = 'mock-session';
const school = { id: 1, name: 'Colegio Demo', slug: 'demo', timezone: 'America/Guatemala' };

const users = {
  'lucia@demo.edu': { id: 2, firstName: 'Lucía', lastName: 'Méndez', role: 'TEACHER' },
  'admin@demo.edu': { id: 1, firstName: 'Rosa', lastName: 'Herrera', role: 'ADMIN' },
  'ana@demo.edu': { id: 4, firstName: 'Ana', lastName: 'López', role: 'STUDENT' },
};

const wait = () => new Promise((resolve) => setTimeout(resolve, 400));

function readSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export async function login({ schoolSlug, email, password }) {
  await wait();
  const user = users[email.trim().toLowerCase()];
  if (schoolSlug.trim().toLowerCase() !== school.slug || !user || !password) {
    throw new ApiError(401, { code: 'INVALID_CREDENTIALS', message: 'Colegio, correo o contraseña incorrectos' });
  }
  const session = { accessToken: 'mock-token', user: { ...user, email, school } };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Sin almacenamiento la sesión solo dura hasta recargar
  }
  return session;
}

export async function refresh() {
  await wait();
  const session = readSession();
  if (!session) throw new ApiError(401, { code: 'REFRESH_MISSING', message: 'No hay una sesión iniciada' });
  return session;
}

export async function logout() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nada que limpiar
  }
  return null;
}
