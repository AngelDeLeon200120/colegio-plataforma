import { pool } from '../../config/database.js';
import { logger } from '../utils/logger.js';

/**
 * withTransaction(async (conn, afterCommit) => { ... })
 *
 * `afterCommit(fn)` registra efectos externos (sockets, emails) que solo deben
 * ocurrir si la transacción se confirma. Si hay rollback, nunca se ejecutan.
 */
export async function withTransaction(work) {
  const connection = await pool.getConnection();
  const hooks = [];

  try {
    await connection.beginTransaction();
    const result = await work(connection, (fn) => hooks.push(fn));
    await connection.commit();

    for (const hook of hooks) {
      try {
        await hook();
      } catch (err) {
        // Los datos ya están confirmados: un fallo aquí no debe convertirse en 500
        logger.error({ err }, 'afterCommit hook failed');
      }
    }
    return result;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}
