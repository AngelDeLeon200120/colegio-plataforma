export const STATUS_META = {
  PENDING: { label: 'Sin entregar', tone: 'neutral' },
  SUBMITTED: { label: 'Entregada', tone: 'blue' },
  REJECTED: { label: 'Requiere corrección', tone: 'amber' },
  APPROVED: { label: 'Aprobada', tone: 'green' },
};

export const FILTERS = [
  { value: 'SUBMITTED', label: 'Por revisar' },
  { value: 'REJECTED', label: 'En corrección' },
  { value: 'PENDING', label: 'Sin entregar' },
  { value: 'APPROVED', label: 'Aprobadas' },
  { value: 'ALL', label: 'Todas' },
];

export const FEEDBACK_SNIPPETS = [
  'Falta el procedimiento completo.',
  'La imagen no es legible, vuelve a subirla.',
  'Revisa los resultados y simplifica.',
  'El archivo está incompleto.',
];

export const MIN_FEEDBACK_LENGTH = 5;
