import multer from 'multer';
import { AppError } from '../errors/AppError.js';

// Los navegadores envían el nombre en UTF-8 pero busboy puede leerlo como latin1
// ("GuÃ­a.pdf"). Solo se corrige si la relectura en UTF-8 es válida.
function fixFileNameEncoding(name) {
  if (!/[\u0080-ÿ]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}

/**
 * upload({ extensions: ['xlsx', 'csv'], maxBytes: 2 * 1024 * 1024, maxFiles: 1 })
 * En memoria: los archivos son pequeños y se validan antes de guardarlos.
 * La extensión se revisa aquí; el contenido real lo valida quien lo procesa.
 */
export function upload({ extensions, maxBytes, maxFiles = 1 }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: maxFiles },
    fileFilter(req, file, callback) {
      file.originalname = fixFileNameEncoding(file.originalname);
      const extension = file.originalname.toLowerCase().split('.').pop();
      if (extensions.includes(extension)) return callback(null, true);
      callback(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', `Formato no permitido. Usa: ${extensions.map((ext) => `.${ext}`).join(', ')}`));
    },
  });
}
