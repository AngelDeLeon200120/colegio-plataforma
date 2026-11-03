// Asuntos de los mensajes, sus íconos y los filtros de la bandeja (sin React).
import { CalendarClock, ClipboardList, Flower2, Palmtree, Shirt, Thermometer } from 'lucide-react';

export const REASONS = {
  LLEGA_TARDE: { label: 'Llega tarde', icon: CalendarClock, color: '#e37400', placeholder: 'ej. Ana llegará tarde hoy' },
  SIN_UNIFORME: { label: 'No llegó con uniforme', short: 'Sin uniforme', icon: Shirt, color: '#9334e6', placeholder: 'ej. Ana va sin uniforme hoy' },
  VACACIONES: { label: 'Está de vacaciones', short: 'Vacaciones', icon: Palmtree, color: '#188038', placeholder: 'ej. Ana estará de vacaciones del 10 al 14' },
  FALLECIMIENTO: { label: 'Fallecimiento', icon: Flower2, color: '#5f6368', placeholder: 'ej. Ausencia por fallecimiento familiar' },
  ENFERMEDAD: { label: 'Enfermo', icon: Thermometer, color: '#d93025', placeholder: 'ej. Ana no asistirá por enfermedad' },
};

export const TASKS_LOOK = { label: 'Tareas', icon: ClipboardList, color: '#1a73e8', placeholder: 'ej. Duda sobre la guía de fracciones' };

/** Ícono, color y nombre del asunto de un hilo. */
export function lookOf(thread) {
  if (thread.topic === 'AUSENCIA' && REASONS[thread.reason]) return REASONS[thread.reason];
  return TASKS_LOOK;
}

export const topicLabel = (thread) => (thread.topic === 'AUSENCIA' ? `Ausencia · ${lookOf(thread).label}` : 'Tareas');

/** Filtros de la bandeja: todos, tareas y cada motivo de ausencia. */
export const FILTERS = [
  { id: 'ALL', label: 'Todos', query: {} },
  { id: 'TAREAS', label: 'Tareas', query: { topic: 'TAREAS' } },
  { id: 'AUSENCIA', label: 'Ausencias', query: { topic: 'AUSENCIA' } },
  ...Object.entries(REASONS).map(([reason, look]) => ({ id: reason, label: look.short ?? look.label, query: { topic: 'AUSENCIA', reason } })),
];

export const ROLE_LABELS = { ADMIN: 'Administración', TEACHER: 'Docente', STUDENT: 'Estudiante', PARENT: 'Familia' };
