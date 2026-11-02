import { BaseRepository } from '../../core/db/BaseRepository.js';

// Estado de un cargo calculado tras cambiar lo pagado, el descuento o la mora.
// En un UPDATE de una tabla, MySQL evalúa las asignaciones en orden: este CASE ya
// ve el paid_amount nuevo. El parámetro es la fecha local de hoy del colegio.
const STATUS_AFTER_CHANGE = `
  status = CASE
    WHEN status = 'VOID' THEN 'VOID'
    WHEN paid_amount >= amount - discount + late_fee THEN 'PAID'
    WHEN paid_amount > 0 THEN 'PARTIAL'
    WHEN due_date < ? THEN 'OVERDUE'
    ELSE 'PENDING'
  END`;

const toCharge = (row, today) => ({
  id: row.id,
  concept: { id: row.fee_concept_id, code: row.concept_code, name: row.concept_name },
  periodLabel: row.period_label,
  description: row.description,
  amount: row.amount,
  discount: row.discount,
  lateFee: row.late_fee,
  paidAmount: row.paid_amount,
  balance: row.balance,
  dueDate: row.due_date,
  status: row.status,
  isOverdue: row.status !== 'VOID' && row.balance > 0 && row.due_date < today,
});

class FinanceRepository extends BaseRepository {
  // `schools` es la tabla del tenant (su id ES el school_id): no pasa por el guard de query()
  async findSchoolInfo() {
    const [rows] = await this.db.execute('SELECT name, timezone, currency FROM schools WHERE id = ?', [this.schoolId]);
    return { name: rows[0].name, timezone: rows[0].timezone, currency: rows[0].currency };
  }

  async findActiveYear() {
    const row = await this.one(`SELECT id, name FROM academic_years WHERE school_id = ? AND status = 'ACTIVE'`, [this.schoolId]);
    return row && { id: row.id, name: row.name };
  }

  async findStudent(studentId) {
    const row = await this.one(
      `SELECT st.id, st.student_code, st.first_name, st.last_name,
              (SELECT CONCAT(gl.short_name, ' ', sec.name)
                 FROM enrollments e
                 JOIN sections sec    ON sec.school_id = e.school_id AND sec.id = e.section_id
                 JOIN grade_levels gl ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
                WHERE e.school_id = st.school_id AND e.student_id = st.id AND e.status = 'ACTIVE'
                ORDER BY e.id DESC LIMIT 1) AS section_name
         FROM students st WHERE st.school_id = ? AND st.id = ?`,
      [this.schoolId, studentId],
    );
    return row && { id: row.id, code: row.student_code, firstName: row.first_name, lastName: row.last_name, section: row.section_name };
  }

  async isGuardian(guardianId, studentId) {
    const row = await this.one(
      'SELECT 1 AS ok FROM guardian_students WHERE school_id = ? AND guardian_id = ? AND student_id = ?',
      [this.schoolId, guardianId, studentId],
    );
    return Boolean(row);
  }

  // --- Conceptos -------------------------------------------------------------

  async listConcepts() {
    const rows = await this.query(
      'SELECT id, code, name, default_amount, is_recurring, is_active FROM fee_concepts WHERE school_id = ? ORDER BY is_active DESC, name',
      [this.schoolId],
    );
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      defaultAmount: row.default_amount,
      isRecurring: Boolean(row.is_recurring),
      isActive: Boolean(row.is_active),
    }));
  }

  async findConcept(conceptId) {
    return (await this.listConcepts()).find((concept) => concept.id === conceptId) ?? null;
  }

  async insertConcept({ code, name, defaultAmount, isRecurring }) {
    const result = await this.query(
      'INSERT INTO fee_concepts (school_id, code, name, default_amount, is_recurring) VALUES (?, ?, ?, ?, ?)',
      [this.schoolId, code, name, defaultAmount, isRecurring],
    );
    return result.insertId;
  }

  async updateConcept(conceptId, { name, defaultAmount, isRecurring, isActive }) {
    await this.query(
      `UPDATE fee_concepts
          SET name = COALESCE(?, name), default_amount = COALESCE(?, default_amount),
              is_recurring = COALESCE(?, is_recurring), is_active = COALESCE(?, is_active)
        WHERE school_id = ? AND id = ?`,
      [name ?? null, defaultAmount ?? null, isRecurring ?? null, isActive ?? null, this.schoolId, conceptId],
    );
  }

  // --- Cargos ----------------------------------------------------------------

  /**
   * Un cargo por estudiante inscrito. INSERT IGNORE + UNIQUE (estudiante, concepto, periodo):
   * repetir la generación no duplica cobros.
   */
  async generateCharges({ academicYearId, conceptId, periodLabel, description, amount, dueDate, sectionIds, today }) {
    const sectionFilter = sectionIds?.length ? `AND e.section_id IN (${sectionIds.map(() => '?').join(', ')})` : '';
    const filterParams = sectionIds?.length ? sectionIds : [];

    const [{ total }] = await this.query(
      `SELECT COUNT(*) AS total FROM enrollments e
        WHERE e.school_id = ? AND e.academic_year_id = ? AND e.status = 'ACTIVE' ${sectionFilter}`,
      [this.schoolId, academicYearId, ...filterParams],
    );

    const result = await this.query(
      `INSERT IGNORE INTO charges
         (school_id, student_id, academic_year_id, fee_concept_id, period_label, description, amount, due_date, status)
       SELECT e.school_id, e.student_id, e.academic_year_id, ?, ?, ?, ?, ?, IF(? < ?, 'OVERDUE', 'PENDING')
         FROM enrollments e
        WHERE e.school_id = ? AND e.academic_year_id = ? AND e.status = 'ACTIVE' ${sectionFilter}`,
      [conceptId, periodLabel, description, amount, dueDate, dueDate, today, this.schoolId, academicYearId, ...filterParams],
    );
    return { candidates: Number(total), created: result.affectedRows };
  }

  async listCharges(studentId, today, { includeVoid = false } = {}) {
    const rows = await this.query(
      `SELECT c.id, c.fee_concept_id, fc.code AS concept_code, fc.name AS concept_name, c.period_label, c.description,
              c.amount, c.discount, c.late_fee, c.paid_amount, c.balance, c.due_date, c.status
         FROM charges c
         JOIN fee_concepts fc ON fc.school_id = c.school_id AND fc.id = c.fee_concept_id
        WHERE c.school_id = ? AND c.student_id = ? ${includeVoid ? '' : "AND c.status <> 'VOID'"}
        ORDER BY c.due_date, c.id`,
      [this.schoolId, studentId],
    );
    return rows.map((row) => toCharge(row, today));
  }

  async findCharge(chargeId) {
    const row = await this.one(
      'SELECT id, student_id, status, paid_amount, amount, discount, late_fee FROM charges WHERE school_id = ? AND id = ?',
      [this.schoolId, chargeId],
    );
    return (
      row && {
        id: row.id,
        studentId: row.student_id,
        status: row.status,
        paidAmount: row.paid_amount,
        amount: row.amount,
        discount: row.discount,
        lateFee: row.late_fee,
      }
    );
  }

  async updateChargeAdjustments(chargeId, { discount, lateFee }, today) {
    await this.query(
      `UPDATE charges SET discount = COALESCE(?, discount), late_fee = COALESCE(?, late_fee), ${STATUS_AFTER_CHANGE}
        WHERE school_id = ? AND id = ?`,
      [discount ?? null, lateFee ?? null, today, this.schoolId, chargeId],
    );
  }

  async voidCharge(chargeId) {
    const result = await this.query(
      `UPDATE charges SET status = 'VOID' WHERE school_id = ? AND id = ? AND paid_amount = 0 AND status <> 'VOID'`,
      [this.schoolId, chargeId],
    );
    return result.affectedRows === 1;
  }

  /** Cargos con saldo, del más antiguo al más reciente, bloqueados hasta el COMMIT. */
  async lockOpenCharges(studentId) {
    const rows = await this.query(
      `SELECT id, balance FROM charges
        WHERE school_id = ? AND student_id = ? AND status <> 'VOID' AND balance > 0
        ORDER BY due_date, id
        FOR UPDATE`,
      [this.schoolId, studentId],
    );
    return rows.map((row) => ({ id: row.id, balance: row.balance }));
  }

  /** Suma (o resta, al revertir) lo pagado y recalcula el estado del cargo. */
  async applyToCharge(chargeId, delta, today) {
    await this.query(
      `UPDATE charges SET paid_amount = paid_amount + ?, ${STATUS_AFTER_CHANGE} WHERE school_id = ? AND id = ?`,
      [delta, today, this.schoolId, chargeId],
    );
  }

  // --- Pagos -----------------------------------------------------------------

  async findRecentDuplicate({ studentId, amount, reference }) {
    const row = await this.one(
      `SELECT id FROM payments
        WHERE school_id = ? AND student_id = ? AND amount = ? AND reference = ? AND status <> 'REVERSED'
          AND created_at >= UTC_TIMESTAMP() - INTERVAL 10 MINUTE`,
      [this.schoolId, studentId, amount, reference],
    );
    return row?.id ?? null;
  }

  async insertPayment({ studentId, payerUserId, amount, method, reference, paidAt, receivedBy, notes }) {
    // El número de recibo depende del id: se inserta uno provisional y se reemplaza
    const provisional = `TMP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await this.query(
      `INSERT INTO payments (school_id, student_id, payer_user_id, amount, method, reference, receipt_number, paid_at, received_by, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [this.schoolId, studentId, payerUserId, amount, method, reference, provisional, paidAt, receivedBy, notes],
    );
    const receiptNumber = `R-${paidAt.getUTCFullYear()}-${String(result.insertId).padStart(6, '0')}`;
    await this.query('UPDATE payments SET receipt_number = ? WHERE school_id = ? AND id = ?', [receiptNumber, this.schoolId, result.insertId]);
    return { id: result.insertId, receiptNumber };
  }

  async insertAllocation(paymentId, chargeId, amount) {
    await this.query('INSERT INTO payment_allocations (school_id, payment_id, charge_id, amount) VALUES (?, ?, ?, ?)', [
      this.schoolId,
      paymentId,
      chargeId,
      amount,
    ]);
  }

  async listPayments(studentId) {
    const rows = await this.query(
      `SELECT p.id, p.receipt_number, p.amount, p.method, p.reference, p.paid_at, p.status, p.notes,
              u.first_name AS receiver_first, u.last_name AS receiver_last,
              pa.charge_id, pa.amount AS allocated, c.description AS charge_description
         FROM payments p
         LEFT JOIN users u ON u.school_id = p.school_id AND u.id = p.received_by
         LEFT JOIN payment_allocations pa ON pa.school_id = p.school_id AND pa.payment_id = p.id
         LEFT JOIN charges c ON c.school_id = pa.school_id AND c.id = pa.charge_id
        WHERE p.school_id = ? AND p.student_id = ?
        ORDER BY p.paid_at DESC, p.id DESC, c.due_date`,
      [this.schoolId, studentId],
    );

    const payments = new Map();
    for (const row of rows) {
      if (!payments.has(row.id)) {
        payments.set(row.id, {
          id: row.id,
          receiptNumber: row.receipt_number,
          amount: row.amount,
          method: row.method,
          reference: row.reference,
          paidAt: row.paid_at,
          status: row.status,
          notes: row.notes,
          receivedBy: row.receiver_first ? `${row.receiver_first} ${row.receiver_last}` : null,
          allocations: [],
        });
      }
      if (row.charge_id) {
        payments.get(row.id).allocations.push({ chargeId: row.charge_id, description: row.charge_description, amount: row.allocated });
      }
    }
    return [...payments.values()];
  }

  async lockPayment(paymentId) {
    const row = await this.one(
      'SELECT id, student_id, status, amount, notes FROM payments WHERE school_id = ? AND id = ? FOR UPDATE',
      [this.schoolId, paymentId],
    );
    return row && { id: row.id, studentId: row.student_id, status: row.status, amount: row.amount, notes: row.notes };
  }

  async listAllocations(paymentId) {
    const rows = await this.query('SELECT charge_id, amount FROM payment_allocations WHERE school_id = ? AND payment_id = ?', [
      this.schoolId,
      paymentId,
    ]);
    return rows.map((row) => ({ chargeId: row.charge_id, amount: row.amount }));
  }

  async markReversed(paymentId, notes) {
    await this.query(`UPDATE payments SET status = 'REVERSED', notes = ? WHERE school_id = ? AND id = ?`, [notes, this.schoolId, paymentId]);
  }

  // --- Cartera y avisos ------------------------------------------------------

  /** Estudiantes del ciclo activo con su saldo y lo vencido, los morosos primero. */
  async portfolio(today, search) {
    const like = search ? `%${search}%` : null;
    const rows = await this.query(
      `SELECT st.id, st.student_code, st.first_name, st.last_name, CONCAT(gl.short_name, ' ', sec.name) AS section_name,
              COALESCE(SUM(CASE WHEN c.status <> 'VOID' THEN c.balance END), 0) AS total_due,
              COALESCE(SUM(CASE WHEN c.status <> 'VOID' AND c.due_date < ? THEN c.balance END), 0) AS overdue,
              MIN(CASE WHEN c.status <> 'VOID' AND c.balance > 0 THEN c.due_date END) AS next_due
         FROM enrollments e
         JOIN academic_years ay ON ay.school_id = e.school_id AND ay.id = e.academic_year_id AND ay.status = 'ACTIVE'
         JOIN students st       ON st.school_id = e.school_id AND st.id = e.student_id
         JOIN sections sec      ON sec.school_id = e.school_id AND sec.id = e.section_id
         JOIN grade_levels gl   ON gl.school_id = sec.school_id AND gl.id = sec.grade_level_id
         LEFT JOIN charges c    ON c.school_id = st.school_id AND c.student_id = st.id AND c.academic_year_id = ay.id
        WHERE e.school_id = ? AND e.status = 'ACTIVE'
          ${like ? 'AND (st.first_name LIKE ? OR st.last_name LIKE ? OR st.student_code LIKE ?)' : ''}
        GROUP BY st.id, st.student_code, st.first_name, st.last_name, section_name
        ORDER BY overdue DESC, total_due DESC, st.last_name, st.first_name`,
      [today, this.schoolId, ...(like ? [like, like, like] : [])],
    );
    return rows.map((row) => ({
      id: row.id,
      code: row.student_code,
      firstName: row.first_name,
      lastName: row.last_name,
      section: row.section_name,
      totalDue: Number(row.total_due),
      overdue: Number(row.overdue),
      nextDue: row.next_due,
    }));
  }

  /** A quién avisar de pagos: encargados financieros; si no hay, los demás que reciben avisos. */
  async financeGuardians(studentId) {
    const rows = await this.query(
      `SELECT guardian_id, is_financial_responsible FROM guardian_students
        WHERE school_id = ? AND student_id = ? AND (is_financial_responsible = 1 OR receives_notifications = 1)`,
      [this.schoolId, studentId],
    );
    const financial = rows.filter((row) => row.is_financial_responsible).map((row) => row.guardian_id);
    return financial.length ? financial : rows.map((row) => row.guardian_id);
  }

  async markOverdue(today) {
    const result = await this.query(`UPDATE charges SET status = 'OVERDUE' WHERE school_id = ? AND status = 'PENDING' AND due_date < ?`, [
      this.schoolId,
      today,
    ]);
    return result.affectedRows;
  }

  /** Cargos con saldo que vencen entre hoy y `until`, o que ya vencieron (con días de atraso). */
  async chargesToRemind(today, until) {
    const rows = await this.query(
      `SELECT c.id, c.student_id, c.description, c.balance, c.due_date, DATEDIFF(?, c.due_date) AS days_overdue,
              st.first_name
         FROM charges c
         JOIN students st ON st.school_id = c.school_id AND st.id = c.student_id AND st.status = 'ACTIVE'
        WHERE c.school_id = ? AND c.status IN ('PENDING', 'PARTIAL', 'OVERDUE') AND c.balance > 0 AND c.due_date <= ?
        ORDER BY c.due_date`,
      [today, this.schoolId, until],
    );
    return rows.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      studentName: row.first_name,
      description: row.description,
      balance: row.balance,
      dueDate: row.due_date,
      daysOverdue: Number(row.days_overdue),
    }));
  }
}

export const financeRepository = new FinanceRepository();
