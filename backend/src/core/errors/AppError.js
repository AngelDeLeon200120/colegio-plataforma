/**
 * Error de dominio con forma HTTP. Todo lo que el cliente debe ver pasa por aquí;
 * cualquier otro error se responde como 500 sin filtrar detalles internos.
 */
export class AppError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static validation(details) {
    return new AppError(400, 'VALIDATION_ERROR', 'Datos de entrada inválidos', details);
  }

  static unauthorized(code = 'UNAUTHENTICATED', message = 'Autenticación requerida') {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'No tienes permiso para realizar esta acción') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  // También se usa para recursos de otro colegio: no se revela que existen.
  static notFound(message = 'Recurso no encontrado') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(code, message) {
    return new AppError(409, code, message);
  }

  static unprocessable(code, message, details) {
    return new AppError(422, code, message, details);
  }
}
