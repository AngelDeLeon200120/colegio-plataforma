// Lee el correo de confirmación de un banco (transferencia, depósito, pago con tarjeta o en línea)
// y extrae lo que necesita "Registrar pago": monto, forma de pago, referencia y fecha.
// Todo ocurre en el navegador: el correo no se envía ni se guarda.

const MONTHS = {
  ene: 1, enero: 1, jan: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, apr: 4,
  may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, aug: 8,
  sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10,
  nov: 11, noviembre: 11, dic: 12, diciembre: 12, dec: 12,
};

const strip = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------------------------------------------------------------------------
// Archivo .eml: partes MIME con quoted-printable o base64, HTML a texto
// ---------------------------------------------------------------------------

function decodeQuotedPrintable(text) {
  const bytes = [];
  const clean = text.replace(/=\r?\n/g, '');
  for (let i = 0; i < clean.length; i += 1) {
    if (clean[i] === '=' && /^[0-9A-F]{2}$/i.test(clean.slice(i + 1, i + 3))) {
      bytes.push(parseInt(clean.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(clean[i]));
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function decodeBase64(text) {
  try {
    const binary = atob(text.replace(/\s+/g, ''));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return '';
  }
}

export function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html.replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)\b[^>]*>/gi, '$&\n'), 'text/html');
  doc.querySelectorAll('script, style').forEach((node) => node.remove());
  return (doc.body?.textContent ?? '').replace(/ /g, ' ');
}

/** Texto legible de un correo: acepta texto pegado, HTML o el archivo .eml completo. */
export function emailToText(raw) {
  const text = String(raw ?? '');
  if (!/^content-type:/im.test(text)) return /<\/?[a-z][\s\S]*>/i.test(text) ? htmlToText(text) : text;

  const parts = [];
  // Cada parte: cabeceras, línea en blanco y cuerpo (también funciona sin multipart)
  const chunks = text.split(/\r?\n--[^\r\n]+/);
  for (const chunk of chunks) {
    const match = chunk.match(/^([\s\S]*?)\r?\n\r?\n([\s\S]*)$/);
    if (!match) continue;
    const [, headers, body] = match;
    const type = headers.match(/content-type:\s*([^;\s]+)/i)?.[1]?.toLowerCase() ?? '';
    if (!type.startsWith('text/')) continue;
    const encoding = headers.match(/content-transfer-encoding:\s*([^\s;]+)/i)?.[1]?.toLowerCase();
    let decoded = encoding === 'base64' ? decodeBase64(body) : encoding === 'quoted-printable' ? decodeQuotedPrintable(body) : body;
    if (type === 'text/html') decoded = htmlToText(decoded);
    parts.push({ type, text: decoded });
  }
  // Se prefiere el texto plano; si no hay, el HTML convertido
  const plain = parts.find((part) => part.type === 'text/plain') ?? parts[0];
  const subject = text.match(/^subject:\s*(.+)$/im)?.[1] ?? '';
  return `${subject}\n${plain?.text ?? text}`;
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

/** "1,300.00" · "1.300,00" · "1300" · "1 300.50" → 1300.5 */
export function parseAmountText(text) {
  const clean = text.replace(/\s/g, '');
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  let normalized;
  if (lastComma > lastDot && /,\d{1,2}$/.test(clean)) normalized = clean.replace(/\./g, '').replace(',', '.');
  else normalized = clean.replace(/,/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

const MONEY = String.raw`(?:Q\.?|GTQ|quetzales)\s*([0-9][0-9.,\s]*[0-9]|[0-9])`;
const MONEY_AFTER = String.raw`([0-9][0-9.,]*[0-9])\s*(?:GTQ|quetzales)`;

function findAmount(text) {
  // 1) Con etiqueta: "Monto: Q1,300.00", "Total transferido GTQ 1300"
  const labeled = new RegExp(
    String.raw`(?:monto|importe|valor|total|cantidad|pagado|transferid[oa]|depositad[oa]|acreditad[oa])[^\n0-9Q]{0,40}(?:${MONEY}|${MONEY_AFTER}|([0-9][0-9.,]*[0-9]))`,
    'i',
  );
  const match = text.match(labeled);
  if (match) {
    const value = parseAmountText(match[1] ?? match[2] ?? match[3] ?? '');
    if (value) return value;
  }
  // 2) Primer monto con moneda
  const money = text.match(new RegExp(MONEY, 'i')) ?? text.match(new RegExp(MONEY_AFTER, 'i'));
  return money ? parseAmountText(money[1]) : null;
}

function findMethod(text) {
  const t = strip(text);
  if (/transferencia|ach\b|transfer\b|banca (en linea|movil|virtual)/.test(t)) return 'TRANSFER';
  if (/deposito|boleta de deposito|depositad/.test(t)) return 'DEPOSIT';
  if (/tarjeta|visa|mastercard|credomatic|pos\b/.test(t)) return 'CARD';
  if (/pago en linea|pago electronico|pasarela|checkout/.test(t)) return 'ONLINE';
  return null;
}

function findReference(text) {
  const label = String.raw`(?:n(?:o|um|úm)?\.?\s*(?:de\s+)?|numero\s+(?:de\s+)?|número\s+(?:de\s+)?)?(?:autorizaci[oó]n|referencia|transacci[oó]n|operaci[oó]n|boleta|comprobante|documento|confirmaci[oó]n|recibo|aprobaci[oó]n|ref\.?)`;
  const regex = new RegExp(String.raw`${label}\s*(?:n(?:o|um)?\.?|#)?\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9\-]{3,40})`, 'gi');
  for (const match of text.matchAll(regex)) {
    const value = match[1].replace(/-+$/, '');
    if (/\d/.test(value) && value.length >= 4) return value.toUpperCase();
  }
  return null;
}

const iso = (year, month, day) => {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** Fechas de Guatemala: día/mes/año; también AAAA-MM-DD y "12 de noviembre de 2026". */
function findDate(text, today) {
  const t = strip(text);
  const candidates = [];
  for (const m of t.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) candidates.push(iso(+m[1], +m[2], +m[3]));
  for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    candidates.push(iso(year, +m[2], +m[1]));
  }
  for (const m of t.matchAll(/\b(\d{1,2})\s*(?:de\s+|-|\/|\s)\s*([a-z]{3,10})\.?\s*(?:de\s+|del\s+|-|\/|\s)\s*(\d{4})\b/g)) {
    if (MONTHS[m[2]]) candidates.push(iso(+m[3], MONTHS[m[2]], +m[1]));
  }
  // La primera fecha válida que no esté en el futuro
  return candidates.find((date) => date && date <= today) ?? null;
}

/**
 * Devuelve { amount, method, reference, paidOn } (null en lo que no encuentre).
 * `today` = "AAAA-MM-DD" local: un pago no puede tener fecha futura.
 */
export function parseBankEmail(raw, today) {
  const text = emailToText(raw).replace(/\r/g, '');
  return {
    amount: findAmount(text),
    method: findMethod(text),
    reference: findReference(text),
    paidOn: findDate(text, today),
  };
}
