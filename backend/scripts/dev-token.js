// Emite un access token para probar la API con curl (solo desarrollo).
// Uso: npm run token -- <userId> <schoolId> [ROLE]
// Lee token_version de la base: si el usuario cerró todas sus sesiones, el token sigue siendo válido.
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { pool } from '../src/config/database.js';

if (env.isProd) {
  console.error('dev-token no está disponible en producción');
  process.exit(1);
}

const [userId, schoolId, role = 'TEACHER'] = process.argv.slice(2);
if (!userId || !schoolId) {
  console.error('Uso: npm run token -- <userId> <schoolId> [ROLE]');
  process.exit(1);
}

const [rows] = await pool.execute('SELECT token_version FROM users WHERE school_id = ? AND id = ?', [schoolId, userId]);
await pool.end();
if (!rows.length) {
  console.error(`No existe el usuario ${userId} en el colegio ${schoolId}`);
  process.exit(1);
}

const token = jwt.sign({ sid: Number(schoolId), role, tv: rows[0].token_version }, env.JWT_ACCESS_SECRET, {
  subject: String(userId),
  audience: 'api',
  expiresIn: '8h',
  algorithm: 'HS256',
});

console.log(token);
