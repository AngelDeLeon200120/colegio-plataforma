import ExcelJS from 'exceljs';
import { AppError } from '../../../core/errors/AppError.js';

export const MAX_IMPORT_ROWS = 1000;

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** Valor "plano" de una celda de exceljs: fórmulas, texto enriquecido, hipervínculos. */
function cellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('result' in value) return cellValue(value.result);
    if ('richText' in value) return value.richText.map((part) => part.text).join('');
    if ('text' in value) return value.text;
    if ('error' in value) return value.error;
    return null;
  }
  return value;
}

async function parseXlsx(buffer) {
  if (!buffer.subarray(0, 4).equals(ZIP_SIGNATURE)) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'El archivo no es un Excel válido (.xlsx)');
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'No se pudo leer el archivo de Excel');
  }

  const worksheet = workbook.getWorksheet('Notas') ?? workbook.worksheets[0];
  if (!worksheet) throw AppError.unprocessable('TEMPLATE_MISMATCH', 'El archivo no tiene hojas');

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // row.values empieza en el índice 1
    rows.push({ rowNumber, cells: row.values.slice(1).map(cellValue) });
  });
  return rows;
}

function detectDelimiter(firstLine) {
  const counts = [';', ',', '\t'].map((delimiter) => [delimiter, firstLine.split(delimiter).length]);
  return counts.sort((a, b) => b[1] - a[1])[0][0];
}

/** CSV con comillas dobles (RFC 4180). Separador ; , o tabulador. */
function parseCsv(buffer) {
  const text = buffer.toString('utf8').replace(/^﻿/, '');
  const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0] ?? '');

  const rows = [];
  let cells = [];
  let field = '';
  let inQuotes = false;
  let rowNumber = 1;

  const endField = () => {
    cells.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (cells.some((cell) => cell.trim() !== '')) rows.push({ rowNumber, cells });
    cells = [];
    rowNumber += 1;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      endRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || cells.length) endRow();
  return rows;
}

/** Devuelve { header, rows } con rows = [{ rowNumber, cells }]. */
export async function parseSheet(file) {
  const extension = file.originalname.toLowerCase().split('.').pop();
  let rows;
  if (extension === 'xlsx') rows = await parseXlsx(file.buffer);
  else if (extension === 'csv') rows = parseCsv(file.buffer);
  else throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Sube un archivo .xlsx o .csv');

  if (rows.length < 2) throw AppError.unprocessable('EMPTY_FILE', 'El archivo no tiene filas de estudiantes');
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    throw AppError.unprocessable('TOO_MANY_ROWS', `El archivo supera el máximo de ${MAX_IMPORT_ROWS} filas`);
  }

  const [header, ...body] = rows;
  return { header: header.cells.map((cell) => String(cell ?? '').trim()), rows: body };
}
