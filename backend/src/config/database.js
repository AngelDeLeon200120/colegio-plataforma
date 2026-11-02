import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: env.DB_POOL_SIZE,
  waitForConnections: true,
  // Todo DATETIME se guarda y se lee en UTC
  timezone: 'Z',
  // DECIMAL como number. Los montos se suman en centavos enteros (ver modules/finance/money.js).
  decimalNumbers: true,
  // DATE sin hora (vencimientos, inicio de unidad) como "YYYY-MM-DD": no hay zona horaria que aplicar
  dateStrings: ['DATE'],
  supportBigNumbers: true,
  enableKeepAlive: true,
});

pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

export async function pingDatabase() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}
