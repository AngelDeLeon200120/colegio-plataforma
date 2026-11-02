// La base guarda UTC; cada colegio vive en su zona horaria (schools.timezone).

const partsFormatters = new Map();

function partsFormatter(timeZone) {
  if (!partsFormatters.has(timeZone)) {
    partsFormatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    );
  }
  return partsFormatters.get(timeZone);
}

/** Fecha local "YYYY-MM-DD" y minutos desde la medianoche local. */
export function localClock(date, timeZone) {
  const parts = Object.fromEntries(partsFormatter(timeZone).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** "30 oct, 11:59 p. m." en la hora del colegio, para textos de notificaciones. */
export function formatLocalDateTime(date, timeZone) {
  return new Intl.DateTimeFormat('es-GT', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}
