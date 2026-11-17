import { Clock, Copy, HelpCircle, Megaphone, Smartphone, UserX } from 'lucide-react';

export const CATEGORIES = {
  LLEGADA_TARDE: { label: 'Llegada tarde', icon: Clock, color: '#d97706' },
  FALTA_RESPETO: { label: 'Falta de respeto', icon: UserX, color: '#dc2626' },
  INDISCIPLINA: { label: 'Indisciplina en clase', icon: Megaphone, color: '#ea580c' },
  CELULAR: { label: 'Sacó el celular', icon: Smartphone, color: '#7c3aed' },
  TAREA_COPIADA: { label: 'Tarea copiada', icon: Copy, color: '#0891b2' },
  OTRO: { label: 'Otro', icon: HelpCircle, color: '#52525b' },
};

export const DECISIONS = {
  CITA_FAMILIA: 'Citación a la familia',
  REUNION_TUTOR: 'Reunión con el tutor',
  OTRA: 'Otra medida',
};

export const FOLLOWUP_STATUS = {
  PENDIENTE: { label: 'Pendiente de decisión', tone: 'red' },
  PROGRAMADO: { label: 'Programado', tone: 'amber' },
  RESUELTO: { label: 'Resuelto', tone: 'green' },
};

/** Tono del contador frente al umbral (3): verde, ámbar al acercarse, rojo al llegar. */
export function counterTone(count, threshold) {
  if (count >= threshold) return 'red';
  if (count >= threshold - 1) return 'amber';
  if (count > 0) return 'blue';
  return 'neutral';
}

// 1.º aviso · 2.º reporte escrito · 3.º reunión con tutores o familia (y se repite)
export const STAGES = {
  AVISO: { step: 1, label: 'Aviso', long: 'Aviso a la familia', tone: 'blue' },
  ESCRITO: { step: 2, label: 'Reporte escrito', long: 'Reporte escrito (notificación formal a la familia)', tone: 'amber' },
  REUNION: { step: 3, label: 'Reunión', long: 'Reunión con tutores o familia', tone: 'red' },
};

export const stageFor = (count) => ['AVISO', 'ESCRITO', 'REUNION'][(count - 1) % 3];
