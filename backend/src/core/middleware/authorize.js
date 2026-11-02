import { AppError } from '../errors/AppError.js';

/** authorize('TEACHER', 'ADMIN') — control grueso por rol. La pertenencia fina va en el servicio. */
export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) throw AppError.forbidden();
  next();
};
