import { Router } from 'express';
import { authorize } from '../../core/middleware/authorize.js';
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
  reversePaymentBody,
  studentParams,
  updateConceptBody,
} from './finance.schemas.js';
import { financeService } from './finance.service.js';

export const financeRouter = Router();

// Familia: estado de cuenta de sus hijos e hijas
financeRouter.get('/me/finance', authorize('PARENT'), validate({ query: familyQuery }), async (req, res) => {
  res.json({ data: await financeService.familyStatement(req.user, req.valid.query.studentId) });
});

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

financeRouter.post('/finance/payments/:paymentId/reverse', validate({ params: paymentParams, body: reversePaymentBody }), async (req, res) => {
  res.json({ data: await financeService.reversePayment(req.user, req.valid.params.paymentId, req.valid.body) });
});
