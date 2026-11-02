import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { localClock } from '../../core/utils/dates.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { financeRepository } from './finance.repository.js';
import { allocateOldestFirst, formatMoney, fromCents, toCents } from './money.js';

const METHOD_LABELS = { CASH: 'efectivo', CARD: 'tarjeta', TRANSFER: 'transferencia', DEPOSIT: 'depósito', ONLINE: 'pago en línea' };

/** Fecha de hoy en la zona horaria del colegio: los vencimientos son fechas locales. */
async function schoolToday() {
  const school = await financeRepository.findSchoolInfo();
  return { school, today: localClock(new Date(), school.timezone).date };
}

function summarize(charges, payments, today) {
  const open = charges.filter((charge) => charge.status !== 'VOID' && charge.balance > 0);
  const sum = (list, pick) => fromCents(list.reduce((total, item) => total + toCents(pick(item)), 0));
  const next = open.find((charge) => charge.dueDate >= today);

  return {
    totalDue: sum(open, (charge) => charge.balance),
    overdue: sum(open.filter((charge) => charge.dueDate < today), (charge) => charge.balance),
    nextDue: next ? { date: next.dueDate, amount: sum(open.filter((c) => c.dueDate === next.dueDate), (c) => c.balance) } : null,
    paidTotal: sum(payments.filter((payment) => payment.status === 'CONFIRMED'), (payment) => payment.amount),
  };
}

async function buildStatement(studentId, { includeVoid }) {
  const student = await financeRepository.findStudent(studentId);
  if (!student) throw AppError.notFound('Estudiante no encontrado');

  const { school, today } = await schoolToday();
  const [charges, payments] = await Promise.all([
    financeRepository.listCharges(studentId, today, { includeVoid }),
    financeRepository.listPayments(studentId),
  ]);
  return {
    student,
    school: { name: school.name, currency: school.currency },
    today,
    summary: summarize(charges, payments, today),
    charges,
    payments,
  };
}

export const financeService = {
  /** Familia: estado de cuenta de un hijo o hija vinculada. */
  async familyStatement(user, studentId) {
    if (!(await financeRepository.isGuardian(user.id, studentId))) throw AppError.notFound('Estudiante no encontrado');
    return buildStatement(studentId, { includeVoid: false });
  },

  adminStatement: (studentId) => buildStatement(studentId, { includeVoid: true }),

  async portfolio({ q }) {
    const { today } = await schoolToday();
    const students = await financeRepository.portfolio(today, q);
    const total = (pick) => fromCents(students.reduce((sum, student) => sum + toCents(pick(student)), 0));
    return {
      today,
      totals: { totalDue: total((s) => s.totalDue), overdue: total((s) => s.overdue), studentsOverdue: students.filter((s) => s.overdue > 0).length },
      students,
    };
  },

  listConcepts: () => financeRepository.listConcepts(),

  async createConcept(body) {
    const id = await financeRepository.insertConcept(body);
    return financeRepository.findConcept(id);
  },

  async updateConcept(conceptId, body) {
    if (!(await financeRepository.findConcept(conceptId))) throw AppError.notFound('Concepto no encontrado');
    await financeRepository.updateConcept(conceptId, body);
    return financeRepository.findConcept(conceptId);
  },

  async generateCharges({ feeConceptId, periodLabel, description, amount, dueDate, sectionIds }) {
    const concept = await financeRepository.findConcept(feeConceptId);
    if (!concept || !concept.isActive) throw AppError.notFound('Concepto no encontrado o inactivo');
    const year = await financeRepository.findActiveYear();
    if (!year) throw AppError.unprocessable('NO_ACTIVE_YEAR', 'No hay un ciclo lectivo activo');

    const { today } = await schoolToday();
    const result = await financeRepository.generateCharges({
      academicYearId: year.id,
      conceptId: concept.id,
      periodLabel,
      description,
      amount: amount ?? concept.defaultAmount,
      dueDate,
      sectionIds,
      today,
    });
    return { ...result, skipped: result.candidates - result.created };
  },

  async adjustCharge(chargeId, { discount, lateFee }) {
    const charge = await financeRepository.findCharge(chargeId);
    if (!charge) throw AppError.notFound('Cargo no encontrado');
    if (charge.status === 'VOID') throw AppError.unprocessable('CHARGE_VOID', 'El cargo está anulado');

    const amount = toCents(charge.amount);
    const nextDiscount = toCents(discount ?? charge.discount);
    const nextLateFee = toCents(lateFee ?? charge.lateFee);
    if (nextDiscount > amount) throw AppError.unprocessable('INVALID_DISCOUNT', 'El descuento no puede superar el monto');
    if (toCents(charge.paidAmount) > amount - nextDiscount + nextLateFee) {
      throw AppError.unprocessable('ALREADY_PAID', 'Ya se pagó más que el nuevo total. Revierte un pago antes de ajustar.');
    }

    const { today } = await schoolToday();
    await financeRepository.updateChargeAdjustments(chargeId, { discount, lateFee }, today);
    return { id: chargeId };
  },

  async voidCharge(chargeId) {
    if (!(await financeRepository.findCharge(chargeId))) throw AppError.notFound('Cargo no encontrado');
    if (!(await financeRepository.voidCharge(chargeId))) {
      throw AppError.unprocessable('CHARGE_HAS_PAYMENTS', 'Solo se anulan cargos sin pagos ni anulados antes');
    }
    return { id: chargeId, status: 'VOID' };
  },

  /**
   * Registra un pago y lo aplica a cargos en una transacción, con los cargos bloqueados
   * para que dos cajeros no apliquen el mismo saldo dos veces.
   */
  async registerPayment(user, body) {
    const student = await financeRepository.findStudent(body.studentId);
    if (!student) throw AppError.notFound('Estudiante no encontrado');

    if (body.reference && (await financeRepository.findRecentDuplicate(body))) {
      throw AppError.conflict('DUPLICATE_PAYMENT', 'Ya se registró un pago igual con esa referencia hace unos minutos');
    }

    const { school, today } = await schoolToday();

    const result = await withTransaction(async (connection, afterCommit) => {
      const repo = financeRepository.withConnection(connection);
      const open = await repo.lockOpenCharges(student.id);

      let allocations;
      if (body.allocations?.length) {
        const balances = new Map(open.map((charge) => [charge.id, toCents(charge.balance)]));
        for (const allocation of body.allocations) {
          const balance = balances.get(allocation.chargeId);
          if (balance === undefined) throw AppError.unprocessable('INVALID_ALLOCATION', `El cargo ${allocation.chargeId} no tiene saldo pendiente`);
          if (toCents(allocation.amount) > balance) throw AppError.unprocessable('INVALID_ALLOCATION', `Se asigna más que el saldo del cargo ${allocation.chargeId}`);
          balances.set(allocation.chargeId, balance - toCents(allocation.amount));
        }
        const assigned = body.allocations.reduce((sum, allocation) => sum + toCents(allocation.amount), 0);
        if (assigned !== toCents(body.amount)) throw AppError.unprocessable('INVALID_ALLOCATION', 'Las asignaciones deben sumar el monto del pago');
        allocations = body.allocations;
      } else {
        const auto = allocateOldestFirst(body.amount, open);
        if (auto.leftover > 0) {
          throw AppError.unprocessable('OVERPAYMENT', `El pago supera el saldo pendiente por ${formatMoney(auto.leftover, school.currency)}`);
        }
        allocations = auto.allocations;
      }

      const payment = await repo.insertPayment({
        studentId: student.id,
        payerUserId: null,
        amount: body.amount,
        method: body.method,
        reference: body.reference,
        paidAt: body.paidAt ?? new Date(),
        receivedBy: user.id,
        notes: body.notes,
      });
      for (const allocation of allocations) {
        await repo.insertAllocation(payment.id, allocation.chargeId, allocation.amount);
        await repo.applyToCharge(allocation.chargeId, allocation.amount, today);
      }

      const guardians = await repo.financeGuardians(student.id);
      const notifications = await notificationsService.createForUsers(connection, guardians, {
        type: 'PAYMENT_RECEIVED',
        priority: 'NORMAL',
        title: `Pago recibido: ${formatMoney(body.amount, school.currency)}`,
        body: `Recibimos el pago de ${student.firstName} ${student.lastName} por ${METHOD_LABELS[body.method]}. Recibo ${payment.receiptNumber}.`,
        entityType: 'payment',
        entityId: payment.id,
        studentId: student.id,
        actionUrl: `/finance?student=${student.id}`,
        dedupeKey: `payment:${payment.id}`,
      });
      afterCommit(() => notificationsService.publish(notifications));

      return { id: payment.id, receiptNumber: payment.receiptNumber, allocations, notifiedGuardians: notifications.length };
    });

    return result;
  },

  /** Revierte un pago (cheque rebotado, error de caja): devuelve el saldo a sus cargos. */
  async reversePayment(user, paymentId, { reason }) {
    const { today } = await schoolToday();

    return withTransaction(async (connection) => {
      const repo = financeRepository.withConnection(connection);
      const payment = await repo.lockPayment(paymentId);
      if (!payment) throw AppError.notFound('Pago no encontrado');
      if (payment.status === 'REVERSED') throw AppError.unprocessable('ALREADY_REVERSED', 'El pago ya estaba revertido');

      for (const allocation of await repo.listAllocations(paymentId)) {
        await repo.applyToCharge(allocation.chargeId, -allocation.amount, today);
      }
      const note = `Revertido por usuario ${user.id} el ${today}: ${reason}`;
      await repo.markReversed(paymentId, payment.notes ? `${payment.notes}\n${note}` : note);
      return { id: paymentId, status: 'REVERSED' };
    });
  },
};
