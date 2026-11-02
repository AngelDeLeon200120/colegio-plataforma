import { env } from '../../config/env.js';
import { authService } from './auth.service.js';

export const REFRESH_COOKIE = 'rt';

// El refresh token solo viaja a /api/v1/auth y nunca es legible desde JavaScript
const cookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'strict',
  path: '/api/v1/auth',
};

const requestMeta = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

function sendSession(res, { refreshToken, session }) {
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: env.REFRESH_TTL_DAYS * 86_400_000 });
  res.json({ data: session });
}

export const authController = {
  async login(req, res) {
    sendSession(res, await authService.login(req.valid.body, requestMeta(req)));
  },

  async refresh(req, res) {
    try {
      sendSession(res, await authService.refresh(req.cookies[REFRESH_COOKIE], requestMeta(req)));
    } catch (err) {
      // Una cookie inválida no debe quedarse reintentando en cada carga
      res.clearCookie(REFRESH_COOKIE, cookieOptions);
      throw err;
    }
  },

  async logout(req, res) {
    await authService.logout(req.cookies[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(204).end();
  },

  async logoutAll(req, res) {
    await authService.logoutAll(req.user);
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    res.status(204).end();
  },

  async me(req, res) {
    res.json({ data: await authService.me(req.user) });
  },
};
