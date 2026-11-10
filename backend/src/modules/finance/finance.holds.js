import { BaseRepository } from '../../core/db/BaseRepository.js';
import { localClock } from '../../core/utils/dates.js';
import { academicRepository } from '../academic/academic.repository.js';

// "Pago pendiente" de una unidad (trimestre): un cobro que vence entre el inicio y el fin de la unidad,
// cuya fecha ya pasó y que sigue con saldo. Lo comparten el cuadro de notas (docente),
// la boleta y las tareas (estudiante y familia).
const UNPAID = `ch.status IN ('PENDING', 'PARTIAL', 'OVERDUE') AND ch.balance > 0
  AND ch.due_date BETWEEN u.starts_on AND u.ends_on AND ch.due_date <= ?`;

class FinanceHoldsRepository extends BaseRepository {
  /** Unidades (de las dadas) en que el estudiante tiene pagos vencidos. */
  async findUnpaidUnitIds(studentId, unitIds, today) {
    if (!unitIds.length) return [];
    const rows = await this.query(
      `SELECT DISTINCT u.id
         FROM charges ch
         JOIN academic_units u ON u.school_id = ch.school_id AND u.id IN (${unitIds.map(() => '?').join(', ')})
        WHERE ch.school_id = ? AND ch.student_id = ? AND ${UNPAID}`,
      [...unitIds, this.schoolId, studentId, today],
    );
    return rows.map((row) => row.id);
  }

  /** Detalle por estudiante de la sección: qué cobros de la unidad tiene vencidos. */
  async findUnpaidCharges({ sectionId, unitId, today }) {
    const rows = await this.query(
      `SELECT ch.student_id, ch.description, ch.due_date, ch.balance, ch.status, DATEDIFF(?, ch.due_date) AS days_overdue
         FROM charges ch
         JOIN academic_units u ON u.school_id = ch.school_id AND u.id = ?
         JOIN enrollments e    ON e.school_id = ch.school_id AND e.student_id = ch.student_id AND e.section_id = ? AND e.status = 'ACTIVE'
        WHERE ch.school_id = ? AND ${UNPAID}
        ORDER BY ch.student_id, ch.due_date`,
      [today, unitId, sectionId, this.schoolId, today],
    );
    return rows.map((row) => ({
      studentId: row.student_id,
      description: row.description,
      dueDate: row.due_date,
      balance: row.balance,
      status: row.status,
      daysOverdue: Number(row.days_overdue),
    }));
  }
}

export const financeHoldsRepository = new FinanceHoldsRepository();

export async function schoolTodayDate() {
  return localClock(new Date(), await academicRepository.findSchoolTimezone()).date;
}

/** Set de unidades con pago pendiente del estudiante. */
export async function unpaidUnitsOf(studentId, unitIds) {
  return new Set(await financeHoldsRepository.findUnpaidUnitIds(studentId, unitIds, await schoolTodayDate()));
}
