import { pool } from '../../config/database.js';

// Cada access token se contrasta con el estado del usuario. El caché evita una
// consulta por petición; un usuario deshabilitado o un "cerrar todas las sesiones"
// en otra instancia tarda como máximo TTL_MS en surtir efecto.
const TTL_MS = 30_000;
const MAX_ENTRIES = 10_000;
const cache = new Map();

async function loadState(schoolId, userId) {
  const [rows] = await pool.execute(
    `SELECT u.token_version, u.status, u.deleted_at, s.status AS school_status
       FROM users u
       JOIN schools s ON s.id = u.school_id
      WHERE u.school_id = ? AND u.id = ?`,
    [schoolId, userId],
  );
  const row = rows[0];
  return {
    active: Boolean(row) && row.status === 'ACTIVE' && !row.deleted_at && row.school_status !== 'SUSPENDED',
    tokenVersion: row?.token_version,
    expiresAt: Date.now() + TTL_MS,
  };
}

/** true si el token sigue siendo válido: usuario activo y misma token_version. */
export async function isSessionValid({ id, schoolId, tokenVersion }) {
  let state = cache.get(id);
  if (!state || state.expiresAt < Date.now()) {
    if (cache.size >= MAX_ENTRIES) cache.clear();
    state = await loadState(schoolId, id);
    cache.set(id, state);
  }
  return state.active && state.tokenVersion === tokenVersion;
}

export function invalidateSession(userId) {
  cache.delete(userId);
}
