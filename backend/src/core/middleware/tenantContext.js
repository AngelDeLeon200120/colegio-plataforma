import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/** Ejecuta `fn` con el colegio y usuario actuales disponibles para toda la cadena async. */
export function runWithTenant(context, fn) {
  return storage.run(context, fn);
}

/**
 * Devuelve { schoolId, userId, role }. Lanza si no hay contexto: una consulta
 * sin tenant es un bug y debe fallar cerrada, nunca devolver datos de todos.
 */
export function getTenant() {
  const context = storage.getStore();
  if (!context?.schoolId) {
    throw new Error('Tenant context missing: la consulta se ejecutó fuera de una petición autenticada o de un job');
  }
  return context;
}
