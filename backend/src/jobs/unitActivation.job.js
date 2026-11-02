import { localClock } from '../core/utils/dates.js';
import { emitToRoom } from '../realtime/emitter.js';
import { rooms } from '../realtime/rooms.js';
import { remindersRepository } from './reminders.repository.js';

/**
 * Activa la siguiente unidad cuando llega su fecha de inicio, pero solo si la
 * administración ya cerró la anterior: el cierre manual siempre manda.
 */
export const unitActivationJob = {
  name: 'unitActivation',
  at: '00:15',
  description: 'Activa la siguiente unidad en su fecha de inicio si la anterior ya está cerrada',

  async run({ school, now }) {
    const { date } = localClock(now, school.timezone);
    const state = await remindersRepository.findUnitToActivate(date);

    if (!state) return { result: 'NO_ACTIVE_YEAR' };
    if (state.activeId) return { result: 'UNIT_STILL_ACTIVE', activeUnitId: state.activeId };
    if (!state.nextId) return { result: 'NOTHING_SCHEDULED' };

    if (!(await remindersRepository.activateUnit(state.nextId))) return { result: 'ALREADY_ACTIVATED' };

    emitToRoom(rooms.school(school.id), 'unit:status_changed', { unitId: state.nextId, status: 'ACTIVE' });
    return { result: 'ACTIVATED', unitId: state.nextId, unitName: await remindersRepository.findUnitName(state.nextId) };
  },
};
