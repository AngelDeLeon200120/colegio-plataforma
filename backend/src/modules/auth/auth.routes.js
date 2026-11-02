import { Router } from 'express';
import { loginLimiter } from '../../core/middleware/rateLimit.js';
import { validate } from '../../core/middleware/validate.js';
import { authController as controller } from './auth.controller.js';
import { loginBody } from './auth.schemas.js';

// Sin access token: login, renovación y cierre del dispositivo actual
export const publicAuthRouter = Router();

publicAuthRouter.post('/auth/login', loginLimiter, validate({ body: loginBody }), controller.login);
publicAuthRouter.post('/auth/refresh', controller.refresh);
publicAuthRouter.post('/auth/logout', controller.logout);

// Requieren access token válido
export const authRouter = Router();

authRouter.get('/auth/me', controller.me);
authRouter.post('/auth/logout-all', controller.logoutAll);
