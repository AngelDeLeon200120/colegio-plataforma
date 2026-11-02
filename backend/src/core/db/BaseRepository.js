import { pool } from '../../config/database.js';
import { getTenant } from '../middleware/tenantContext.js';

/**
 * Base de todos los repositorios.
 *  - `this.schoolId` sale del contexto de la petición (o del job), nunca de parámetros del cliente.
 *  - `query` rechaza SQL que no mencione school_id: falla cerrado ante un olvido.
 *  - `withConnection(conn)` devuelve una instancia ligada a una transacción.
 */
export class BaseRepository {
  constructor(db = pool) {
    this.db = db;
  }

  get schoolId() {
    return getTenant().schoolId;
  }

  withConnection(connection) {
    return new this.constructor(connection);
  }

  async query(sql, params = []) {
    if (!/\bschool_id\b/.test(sql)) {
      throw new Error(`${this.constructor.name}: consulta sin filtro school_id`);
    }
    const [result] = await this.db.execute(sql, params);
    return result;
  }

  async one(sql, params) {
    const rows = await this.query(sql, params);
    return rows[0] ?? null;
  }
}
