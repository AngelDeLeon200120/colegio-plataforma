const LOCALE = 'es-GT';

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const relativeFormat = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

const UNITS = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

export function formatDateTime(iso) {
  return iso ? dateTimeFormat.format(new Date(iso)) : '—';
}

export function formatRelative(iso, now = Date.now()) {
  if (!iso) return '—';
  const seconds = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return 'justo ahora';
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${Number((bytes / 1024 ** 2).toFixed(1))} MB`;
}

export function formatMoney(amount, currency = 'GTQ') {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(amount ?? 0);
}

/** Fechas sin hora ("2026-11-05"): se muestran tal cual, sin convertir de zona horaria. */
export function formatDate(isoDate, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!isoDate) return '—';
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' }).format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`));
}

export function formatScore(score) {
  return score === null || score === undefined ? '—' : Number(score).toLocaleString(LOCALE, { maximumFractionDigits: 2 });
}
