import ExcelJS from 'exceljs';

// Cada columna de nota lleva su id en el encabezado: "Examen (/100) [#12]".
// Así el archivo se puede validar contra el curso y la unidad correctos,
// tanto en Excel como en CSV (que no admite hojas ocultas ni metadatos).
export const itemHeader = (item) => `${item.name} (/${item.maxScore}) [#${item.id}]`;

export const FIXED_HEADERS = ['Código', 'Estudiante'];

const slug = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

function buildRows({ items, students, scores }) {
  const byCell = new Map(scores.map((score) => [`${score.studentId}:${score.gradeItemId}`, score.score]));
  return students.map((student) => [
    student.code,
    `${student.lastName}, ${student.firstName}`,
    ...items.map((item) => byCell.get(`${student.id}:${item.id}`) ?? null),
  ]);
}

async function buildXlsx(sheet) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Plataforma escolar';

  const worksheet = workbook.addWorksheet('Notas', { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
  worksheet.columns = [
    { header: FIXED_HEADERS[0], width: 12 },
    { header: FIXED_HEADERS[1], width: 32 },
    ...sheet.items.map((item) => ({ header: itemHeader(item), width: Math.max(16, itemHeader(item).length + 2) })),
  ];

  const header = worksheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F5' } };

  buildRows(sheet).forEach((row) => worksheet.addRow(row));

  // Excel avisa al escribir una nota fuera de rango, antes de subir el archivo
  sheet.items.forEach((item, index) => {
    const column = worksheet.getColumn(FIXED_HEADERS.length + index + 1);
    column.numFmt = '0.##';
    for (let rowNumber = 2; rowNumber <= sheet.students.length + 1; rowNumber += 1) {
      worksheet.getCell(rowNumber, column.number).dataValidation = {
        type: 'decimal',
        operator: 'between',
        allowBlank: true,
        formulae: [0, item.maxScore],
        showErrorMessage: true,
        errorTitle: 'Nota fuera de rango',
        error: `La nota de "${item.name}" debe estar entre 0 y ${item.maxScore}.`,
      };
    }
  });

  const help = workbook.addWorksheet('Instrucciones');
  [
    `Curso: ${sheet.course.name} · ${sheet.unit.name}`,
    '',
    '1. Escribe las notas en la hoja "Notas". Usa punto o coma decimal (máximo 2 decimales).',
    '2. Deja en blanco las celdas que no quieras cambiar: una celda vacía no borra la nota existente.',
    '3. No cambies los códigos ni los encabezados: el [#número] identifica cada columna.',
    '4. Sube el archivo en "Importar". Verás los cambios y errores antes de aplicarlos.',
  ].forEach((line) => help.addRow([line]));
  help.getColumn(1).width = 100;
  help.getRow(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function csvField(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ";" como separador: es lo que Excel en español espera al abrir un CSV.
// BOM para que respete tildes y eñes.
function buildCsv(sheet) {
  const lines = [[...FIXED_HEADERS, ...sheet.items.map(itemHeader)], ...buildRows(sheet)];
  return Buffer.from(`﻿${lines.map((line) => line.map(csvField).join(';')).join('\r\n')}\r\n`, 'utf8');
}

export async function buildTemplate(sheet, format) {
  const baseName = `notas-${slug(sheet.course.name)}-${slug(sheet.unit.name)}`;
  if (format === 'csv') {
    return { buffer: buildCsv(sheet), fileName: `${baseName}.csv`, contentType: 'text/csv; charset=utf-8' };
  }
  return {
    buffer: await buildXlsx(sheet),
    fileName: `${baseName}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
