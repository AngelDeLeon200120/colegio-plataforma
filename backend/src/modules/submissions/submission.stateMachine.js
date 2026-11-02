import { AppError } from '../../core/errors/AppError.js';

export const SubmissionStatus = Object.freeze({
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
});

const { PENDING, SUBMITTED, REJECTED, APPROVED } = SubmissionStatus;

// Única fuente de verdad de las transiciones válidas
const TRANSITIONS = {
  submit: { from: [PENDING, REJECTED], to: SUBMITTED, label: 'entregar' },
  approve: { from: [SUBMITTED], to: APPROVED, label: 'aprobar' },
  reject: { from: [SUBMITTED], to: REJECTED, label: 'rechazar' },
};

/** Devuelve el estado destino o lanza 422 INVALID_TRANSITION. */
export function assertTransition(action, currentStatus) {
  const transition = TRANSITIONS[action];
  if (!transition) throw new Error(`Acción desconocida: ${action}`);

  if (!transition.from.includes(currentStatus)) {
    throw AppError.unprocessable(
      'INVALID_TRANSITION',
      `No se puede ${transition.label} una entrega en estado ${currentStatus}`,
    );
  }
  return transition.to;
}
