import { Router } from 'express';
import { authorize } from '../../core/middleware/authorize.js';
import { upload } from '../../core/middleware/upload.js';
import { validate } from '../../core/middleware/validate.js';
import { emitToRoom } from '../../realtime/emitter.js';
import { rooms } from '../../realtime/rooms.js';
import {
  adjustChargeBody,
  chargeParams,
  conceptParams,
  createConceptBody,
  createPaymentBody,
  familyQuery,
  generateChargesBody,
  paymentParams,
  portfolioQuery,
  rejectReportBody,
  reportPaymentBody,
  reversePaymentBody,
  studentParams,
  updateConceptBody,
} from './finance.schemas.js';
import { financeService } from './finance.service.js';

export const financeRouter = Router();

const RECEIPT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf'];

// Familia: estado de cuenta de sus hijos e hijas
financeRouter.get('/me/finance', authorize('PARENT'), validate({ query: familyQuery }), async (req, res) => {
  res.json({ data: await financeService.familyStatement(req.user, req.valid.query.studentId) });
});

// Familia: reporta un pago con la foto o PDF de la boleta (queda en verificación)
financeRouter.post(
  '/me/finance/payment-reports',
  authorize('PARENT'),
  upload({ extensions: RECEIPT_EXTENSIONS, maxBytes: 10 * 1024 * 1024 }).single('file'),
  validate({ body: reportPaymentBody }),
  async (req, res) => {
    res.status(201).json({ data: await financeService.reportPayment(req.user, req.valid.body, req.file) });
  },
);

// Administración
const admin = authorize('ADMIN');
financeRouter.use('/finance', admin);

// Cualquier cambio de cobros (cargos, pagos, reversiones) puede cambiar quién tiene pagos pendientes.
// Aviso sin datos a la sala del colegio: el cuadro de notas abierto vuelve a consultar el estado.
financeRouter.use('/finance', (req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) emitToRoom(rooms.school(req.user.schoolId), 'finance:status_changed', {});
    });
  }
  next();
});

financeRouter.get('/finance/students', validate({ query: portfolioQuery }), async (req, res) => {
  res.json({ data: await financeService.portfolio(req.valid.query) });
});

financeRouter.get('/finance/students/:studentId', validate({ params: studentParams }), async (req, res) => {
  res.json({ data: await financeService.adminStatement(req.valid.params.studentId) });
});

financeRouter.get('/finance/fee-concepts', async (req, res) => {
  res.json({ data: await financeService.listConcepts() });
});

financeRouter.post('/finance/fee-concepts', validate({ body: createConceptBody }), async (req, res) => {
  res.status(201).json({ data: await financeService.createConcept(req.valid.body) });
});

financeRouter.patch('/finance/fee-concepts/:conceptId', validate({ params: conceptParams, body: updateConceptBody }), async (req, res) => {
  res.json({ data: await financeService.updateConcept(req.valid.params.conceptId, req.valid.body) });
});

financeRouter.post('/finance/charges/generate', validate({ body: generateChargesBody }), async (req, res) => {
  res.status(201).json({ data: await financeService.generateCharges(req.valid.body) });
});

financeRouter.patch('/finance/charges/:chargeId', validate({ params: chargeParams, body: adjustChargeBody }), async (req, res) => {
  res.json({ data: await financeService.adjustCharge(req.valid.params.chargeId, req.valid.body) });
});

financeRouter.post('/finance/charges/:chargeId/void', validate({ params: chargeParams }), async (req, res) => {
  res.json({ data: await financeService.voidCharge(req.valid.params.chargeId) });
});

financeRouter.post('/finance/payments', validate({ body: createPaymentBody }), async (req, res) => {
  res.status(201).json({ data: await financeService.registerPayment(req.user, req.valid.body) });
});

// Foto o PDF de la boleta: multer antes de validate (llega en multipart)
financeRouter.post(
  '/finance/payments/:paymentId/receipt',
  upload({ extensions: RECEIPT_EXTENSIONS, maxBytes: 10 * 1024 * 1024 }).single('file'),
  validate({ params: paymentParams }),
  async (req, res) => {
    res.status(201).json({ data: await financeService.attachReceipt(req.user, req.valid.params.paymentId, req.file) });
  },
);

// Pagos reportados por las familias: verificar contra el banco y confirmar o rechazar
financeRouter.get('/finance/payment-reports', async (req, res) => {
  res.json({ data: await financeService.listReported() });
});

financeRouter.post('/finance/payment-reports/:paymentId/confirm', validate({ params: paymentParams }), async (req, res) => {
  res.json({ data: await financeService.confirmReported(req.user, req.valid.params.paymentId) });
});

financeRouter.post('/finance/payment-reports/:paymentId/reject', validate({ params: paymentParams, body: rejectReportBody }), async (req, res) => {
  res.json({ data: await financeService.rejectReported(req.user, req.valid.params.paymentId, req.valid.body) });
});

financeRouter.post('/finance/payments/:paymentId/reverse', validate({ params: paymentParams, body: reversePaymentBody }), async (req, res) => {
  res.json({ data: await financeService.reversePayment(req.user, req.valid.params.paymentId, req.valid.body) });
});
