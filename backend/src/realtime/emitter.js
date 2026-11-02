import { randomUUID } from 'node:crypto';
import { getIO } from './socket.js';
import { rooms } from './rooms.js';

// Sobre común: el `id` permite al cliente descartar duplicados tras reconexiones
function envelope(type, data) {
  return { id: `evt_${randomUUID()}`, type, occurredAt: new Date().toISOString(), data };
}

export function emitToUsers(userIds, type, data) {
  const io = getIO();
  if (!io || !userIds.length) return;
  io.to(userIds.map(rooms.user)).emit(type, envelope(type, data));
}

export function emitToRoom(room, type, data) {
  getIO()?.to(room).emit(type, envelope(type, data));
}
