import { ZodError } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../errors/AppError.js';

export function notFoundHandler(req, res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

/** Traduce errores conocidos de librerías y MySQL a AppError. */
function normalize(err) {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    return AppError.validation(err.issues.map((issue) => ({ field: issue.path.join('.'), issue: issue.message })));
  }

  if (err?.type === 'entity.parse.failed') return new AppError(400, 'MALFORMED_JSON', 'El cuerpo no es JSON válido');
  if (err?.type === 'entity.too.large') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo excede el tamaño permitido');

  switch (err?.code) {
    case 'ER_DUP_ENTRY':
      return new AppError(409, 'DUPLICATE', 'El registro ya existe');
    // Incluye FKs compuestas (school_id, x_id): referencia a otro colegio = no existe
    case 'ER_NO_REFERENCED_ROW_2':
      return new AppError(404, 'NOT_FOUND', 'Un recurso relacionado no existe');
    case 'ER_ROW_IS_REFERENCED_2':
      return new AppError(409, 'IN_USE', 'El registro está en uso y no puede eliminarse');
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return new AppError(422, 'CONSTRAINT_VIOLATION', 'Los datos no cumplen una regla de negocio');
    // multer
    case 'LIMIT_FILE_SIZE':
      return new AppError(413, 'FILE_TOO_LARGE', 'El archivo supera el tamaño máximo permitido');
    case 'LIMIT_FILE_COUNT':
      return new AppError(400, 'TOO_MANY_FILES', 'Se subieron más archivos de los permitidos');
    case 'LIMIT_UNEXPECTED_FILE':
      return new AppError(400, 'INVALID_UPLOAD', `Campo de archivo inesperado: ${err.field}`);
    case 'ER_LOCK_DEADLOCK':
    case 'ER_LOCK_WAIT_TIMEOUT':
      return new AppError(409, 'RETRY', 'Operación concurrente, intenta de nuevo');
    default:
      return null;
  }
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let error = normalize(err);

  if (!error || error.statusCode >= 500) {
    req.log.error({ err }, 'Unhandled error');
    error ??= new AppError(500, 'INTERNAL_ERROR', env.isProd ? 'Error interno del servidor' : err.message);
  }

  res.status(error.statusCode).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
      requestId: req.id,
    },
  });
}
