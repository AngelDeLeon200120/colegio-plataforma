import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { pool } from '../config/database.js';
import { logger } from '../core/utils/logger.js';
import { verifyAccessToken } from '../core/middleware/authenticate.js';
import { isSessionValid } from '../core/security/sessionGuard.js';
import { rooms } from './rooms.js';

let io = null;

export function getIO() {
  return io;
}

async function canJoinCourseStaff(user, courseId) {
  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') return false;
  const [rows] = await pool.execute('SELECT teacher_id FROM courses WHERE school_id = ? AND id = ?', [
    user.schoolId,
    courseId,
  ]);
  if (!rows.length) return false;
  return user.role === 'ADMIN' || rows[0].teacher_id === user.id;
}

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
  });

  // Handshake: mismo JWT y mismas reglas de sesión que la API REST
  io.use(async (socket, next) => {
    const reject = (code) => {
      const error = new Error('Unauthorized');
      error.data = { code };
      next(error);
    };

    let user;
    try {
      user = verifyAccessToken(socket.handshake.auth?.token);
    } catch (err) {
      return reject(err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN');
    }

    try {
      if (!(await isSessionValid(user))) return reject('SESSION_REVOKED');
    } catch (err) {
      logger.error({ err }, 'socket session check failed');
      return reject('INTERNAL_ERROR');
    }

    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    // Las salas las decide el servidor, nunca el cliente
    socket.join([rooms.user(user.id), rooms.school(user.schoolId)]);

    socket.on('course:subscribe', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const courseId = Number(payload?.courseId);
      if (!Number.isInteger(courseId) || courseId <= 0) return reply({ ok: false, code: 'VALIDATION_ERROR' });

      try {
        if (!(await canJoinCourseStaff(user, courseId))) return reply({ ok: false, code: 'FORBIDDEN' });
        await socket.join(rooms.courseStaff(courseId));
        reply({ ok: true });
      } catch (err) {
        logger.error({ err, courseId }, 'course:subscribe failed');
        reply({ ok: false, code: 'INTERNAL_ERROR' });
      }
    });

    socket.on('course:unsubscribe', async (payload, ack) => {
      await socket.leave(rooms.courseStaff(Number(payload?.courseId)));
      if (typeof ack === 'function') ack({ ok: true });
    });
  });

  return io;
}
