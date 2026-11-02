// Verifica que el contenido del archivo corresponda a su extensión ("magic bytes").
// Así un .exe renombrado a .pdf no entra, aunque el navegador diga application/pdf.

const startsWith = (buffer, bytes, offset = 0) =>
  buffer.length >= offset + bytes.length && bytes.every((byte, index) => buffer[offset + index] === byte);

const ascii = (text) => [...text].map((char) => char.charCodeAt(0));

const isPdf = (b) => startsWith(b, ascii('%PDF-'));
const isPng = (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isJpeg = (b) => startsWith(b, [0xff, 0xd8, 0xff]);
const isGif = (b) => startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a'));
const isWebp = (b) => startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8);
// Fotos de iPhone: contenedor ISO-BMFF con marca HEIC/HEIF
const isHeic = (b) =>
  startsWith(b, ascii('ftyp'), 4) && ['heic', 'heix', 'hevc', 'mif1', 'msf1'].some((brand) => startsWith(b, ascii(brand), 8));
// .docx/.xlsx/.pptx/.zip son ZIP; .doc/.xls/.ppt antiguos son OLE
const isZip = (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
const isOle = (b) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const CHECKS = {
  pdf: isPdf,
  png: isPng,
  jpg: isJpeg,
  jpeg: isJpeg,
  gif: isGif,
  webp: isWebp,
  heic: isHeic,
  heif: isHeic,
  docx: isZip,
  xlsx: isZip,
  pptx: isZip,
  zip: isZip,
  doc: isOle,
  xls: isOle,
  ppt: isOle,
};

/** Extensiones aceptadas en entregas de estudiantes. */
export const SUBMISSION_EXTENSIONS = Object.keys(CHECKS);

export const extensionOf = (fileName) => fileName.toLowerCase().split('.').pop();

export function matchesSignature(file) {
  const check = CHECKS[extensionOf(file.originalname)];
  return Boolean(check?.(file.buffer));
}

// Tipos que el navegador puede mostrar en una pestaña sin riesgo (sin HTML ni SVG)
const INLINE_TYPES = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** Content-Type seguro para servir el archivo. Lo desconocido se descarga como binario. */
export function servingTypeFor(fileName) {
  const inline = INLINE_TYPES[extensionOf(fileName)];
  return inline ? { contentType: inline, inline: true } : { contentType: 'application/octet-stream', inline: false };
}
