import http from 'node:http';
import { env } from './config/env.js';
import { pool, pingDatabase } from './config/database.js';
import { logger } from './core/utils/logger.js';
import { createApp } from './app.js';
import { initSocket } from './realtime/socket.js';
import { startScheduler } from './jobs/scheduler.js';

const app = createApp();
const httpServer = http.createServer(app);
const io = initSocket(httpServer);

try {
  await pingDatabase();
  logger.info({ host: env.DB_HOST, db: env.DB_NAME }, 'MySQL conectado');
} catch (err) {
  logger.fatal({ err }, 'No se pudo conectar a MySQL');
  process.exit(1);
}

httpServer.listen(env.PORT, () => {
  logger.info(`API escuchando en http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
});

const scheduler = startScheduler();

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Cerrando servidor...');

  // Si algo se cuelga, forzar salida para que el orquestador reinicie
  setTimeout(() => process.exit(1), 10_000).unref();

  scheduler?.stop();
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  await pool.end();
  logger.info('Servidor detenido');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});
