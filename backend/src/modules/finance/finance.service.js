import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { matchesSignature } from '../../core/security/fileSignature.js';
import { localClock } from '../../core/utils/dates.js';
import { emitToRoom } from '../../realtime/emitter.js';
import { rooms } from '../../realtime/rooms.js';
import { filesService } from '../files/files.service.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { financeRepository } from './finance.repository.js';
import { allocateOldestFirst, formatMoney, fromCents, toCents } from './money.js';

const METHOD_LABELS = { CASH: 'efectivo', CARD: 'tarjeta', TRANSFER: 'transferencia', DEPOSIT: 'depósito', ONLINE: 'pago en línea' };

/** Fecha de hoy en la zona horaria del colegio: los vencimientos son fechas locales. */
async function schoolToday() {
  const school = await financeRepository.findSchoolInfo();
  return { school, today: localClock(new Date(), school.timezone).date };
}

/** Mediodía de esa fecha en la hora del colegio (la familia solo indica el día). */
function localNoon(date, timeZone) {
  const utcNoon = new Date(`${date}T12:00:00Z`);
  const localHour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(utcNoon));
  return new Date(utcNoon.getTime() - (localHour - 12) * 3_600_000);
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

  /**
   * Adjunta la foto o PDF de la boleta a un pago ya registrado. Va aparte del registro:
   * si la subida falla, el pago queda igual y se puede reintentar.
   */
  async attachReceipt(user, paymentId, file) {
    if (!file) throw AppError.validation([{ field: 'file', issue: 'Adjunta la foto o PDF del comprobante' }]);
    const payment = await financeRepository.findPaymentForReceipt(paymentId);
    if (!payment) throw AppError.notFound('Pago no encontrado');
    if (!matchesSignature(file)) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'El archivo no es una imagen o PDF válido. Usa JPG, PNG, WEBP, HEIC o PDF.');
    }
    const fileId = await filesService.store(user, file, 'PAYMENT_RECEIPT');
    await financeRepository.setReceiptFile(payment.id, fileId);
    return { id: payment.id, receiptFileId: fileId };
  },

  /**
   * La familia reporta un pago con la foto o PDF de la boleta. Queda "en verificación":
   * no toca saldos ni cargos hasta que la administración lo confirme.
   */
  async reportPayment(user, body, file) {
    if (!(await financeRepository.isGuardian(user.id, body.studentId))) throw AppError.notFound('Estudiante no encontrado');
    if (!file) throw AppError.validation([{ field: 'file', issue: 'Adjunta la foto o PDF de la boleta' }]);
    if (!matchesSignature(file)) {
      throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'El archivo no es una imagen o PDF válido. Usa JPG, PNG, WEBP, HEIC o PDF.');
    }
    const student = await financeRepository.findStudent(body.studentId);
    if (!student) throw AppError.notFound('Estudiante no encontrado');
    if (body.reference && (await financeRepository.findRecentDuplicate(body))) {
      throw AppError.conflict('DUPLICATE_PAYMENT', 'Ya se reportó un pago igual con esa referencia hace unos minutos');
    }

    const { school, today } = await schoolToday();
    if (body.paidOn > today) throw AppError.validation([{ field: 'paidOn', issue: 'La fecha del pago no puede ser futura' }]);

    // Disco antes de la transacción (no es transaccional), como en el resto de archivos
    const fileId = await filesService.store(user, file, 'PAYMENT_RECEIPT');
    return withTransaction(async (connection, afterCommit) => {
      const repo = financeRepository.withConnection(connection);
      const payment = await repo.insertPayment({
        studentId: student.id,
        payerUserId: user.id,
        amount: body.amount,
        method: body.method,
        reference: body.reference,
        paidAt: localNoon(body.paidOn, school.timezone),
        receivedBy: null,
        notes: body.notes,
        status: 'PENDING_VERIFICATION',
      });
      await repo.setReceiptFile(payment.id, fileId);

      const admins = await repo.findAdminIds();
      const notifications = await notificationsService.createForUsers(connection, admins, {
        type: 'PAYMENT_REPORTED',
        priority: 'NORMAL',
        title: `Pago por verificar: ${formatMoney(body.amount, school.currency)}`,
        body: `${student.firstName} ${student.lastName} · ${METHOD_LABELS[body.method]}${body.reference ? ` · Ref. ${body.reference}` : ''}`,
        entityType: 'payment',
        entityId: payment.id,
        actionUrl: '/admin/finance?verify=1',
        dedupeKey: `payment-reported:${payment.id}`,
      });
      afterCommit(() => {
        notificationsService.publish(notifications);
        emitToRoom(rooms.school(user.schoolId), 'finance:status_changed', {});
      });
      return { id: payment.id, status: 'PENDING_VERIFICATION', reference: payment.receiptNumber };
    });
  },

  listReported: () => financeRepository.listReported(),

  /** Verificado contra el banco: se aplica a los cargos más antiguos, como un pago de caja. */
  async confirmReported(user, paymentId) {
    const { school, today } = await schoolToday();
    return withTransaction(async (connection, afterCommit) => {
      const repo = financeRepository.withConnection(connection);
      const payment = await repo.lockPayment(paymentId);
      if (!payment) throw AppError.notFound('Pago no encontrado');
      if (payment.status !== 'PENDING_VERIFICATION') throw AppError.unprocessable('NOT_PENDING', 'Este pago ya fue confirmado o rechazado');

      const open = await repo.lockOpenCharges(payment.studentId);
      const { allocations, leftover } = allocateOldestFirst(payment.amount, open);
      if (leftover > 0) {
        throw AppError.unprocessable(
          'OVERPAYMENT',
          `El pago supera el saldo pendiente por ${formatMoney(leftover, school.currency)}. Recházalo y pide a la familia que lo reporte por el monto correcto.`,
        );
      }
      for (const allocation of allocations) {
        await repo.insertAllocation(payment.id, allocation.chargeId, allocation.amount);
        await repo.applyToCharge(allocation.chargeId, allocation.amount, today);
      }
      const receiptNumber = await repo.confirmReported(payment.id, user.id, payment.paidAt);

      const student = await repo.findStudent(payment.studentId);
      const guardians = await repo.financeGuardians(payment.studentId);
      const notifications = await notificationsService.createForUsers(connection, [...new Set([...guardians, payment.payerUserId].filter(Boolean))], {
        type: 'PAYMENT_RECEIVED',
        priority: 'NORMAL',
        title: `Pago confirmado: ${formatMoney(payment.amount, school.currency)}`,
        body: `Verificamos el pago de ${student.firstName} ${student.lastName}. Recibo ${receiptNumber}.`,
        entityType: 'payment',
        entityId: payment.id,
        studentId: payment.studentId,
        actionUrl: `/finance?student=${payment.studentId}`,
        dedupeKey: `payment:${payment.id}`,
      });
      afterCommit(() => notificationsService.publish(notifications));
      return { id: payment.id, status: 'CONFIRMED', receiptNumber, allocations };
    });
  },

  /** No aparece en el banco o no corresponde: se rechaza con motivo y se avisa a la familia. */
  async rejectReported(user, paymentId, { reason }) {
    const { school, today } = await schoolToday();
    return withTransaction(async (connection, afterCommit) => {
      const repo = financeRepository.withConnection(connection);
      const payment = await repo.lockPayment(paymentId);
      if (!payment) throw AppError.notFound('Pago no encontrado');
      if (payment.status !== 'PENDING_VERIFICATION') throw AppError.unprocessable('NOT_PENDING', 'Este pago ya fue confirmado o rechazado');

      const note = `Rechazado por usuario ${user.id} el ${today}: ${reason}`;
      await repo.markReversed(payment.id, payment.notes ? `${payment.notes}\n${note}` : note);

      const guardians = await repo.financeGuardians(payment.studentId);
      const notifications = await notificationsService.createForUsers(connection, [...new Set([...guardians, payment.payerUserId].filter(Boolean))], {
        type: 'PAYMENT_REJECTED',
        priority: 'HIGH',
        title: `Pago no verificado: ${formatMoney(payment.amount, school.currency)}`,
        body: `Motivo: ${reason}`.slice(0, 1000),
        entityType: 'payment',
        entityId: payment.id,
        studentId: payment.studentId,
        actionUrl: `/finance?student=${payment.studentId}`,
        dedupeKey: `payment-rejected:${payment.id}`,
      });
      afterCommit(() => notificationsService.publish(notifications));
      return { id: payment.id, status: 'REJECTED' };
    });
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
