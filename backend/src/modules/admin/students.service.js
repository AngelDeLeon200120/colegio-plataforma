import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { localClock } from '../../core/utils/dates.js';
import { academicRepository } from '../academic/academic.repository.js';
import { adminStudentsRepository } from './students.repository.js';
import { adminUsersRepository } from './users.repository.js';
import { createAccount } from './users.service.js';

async function today() {
  return localClock(new Date(), await academicRepository.findSchoolTimezone()).date;
}

async function requireActiveYear() {
  const yearId = await adminStudentsRepository.findActiveYearId();
  if (!yearId) throw AppError.unprocessable('NO_ACTIVE_YEAR', 'No hay un ciclo lectivo activo');
  return yearId;
}

async function withCodeCheck(work) {
  try {
    return await work();
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY' && String(err.sqlMessage).includes('uq_students_code')) {
      throw AppError.conflict('CODE_TAKEN', 'Ya existe un estudiante con ese código');
    }
    throw err;
  }
}

/**
 * Inscribe, traslada o retira al estudiante en el ciclo activo (dentro de una transacción).
 * sectionId null = retirar.
 */
async function applyEnrollment(connection, studentId, sectionId, yearId) {
  const repo = adminStudentsRepository.withConnection(connection);
  const date = await today();
  const current = await repo.findEnrollment(studentId, yearId);

  if (sectionId === null) {
    if (!current || current.status !== 'ACTIVE') return { changed: false };
    await repo.withdrawEnrollment(current.id, date);
    await repo.stopRemindersInSection(studentId, current.sectionId);
    return { changed: true, status: 'WITHDRAWN' };
  }

  if (!(await repo.findSectionInYear(sectionId, yearId))) throw AppError.notFound('Sección no encontrada en el ciclo activo');
  if (current?.status === 'ACTIVE' && current.sectionId === sectionId) return { changed: false };

  if (current) {
    if (current.status === 'ACTIVE') await repo.stopRemindersInSection(studentId, current.sectionId);
    await repo.moveEnrollment(current.id, sectionId, date);
  } else {
    await repo.insertEnrollment(studentId, sectionId, yearId, date);
  }
  const pendingCreated = await repo.createPendingForSection(studentId, sectionId);
  return { changed: true, status: 'ACTIVE', pendingCreated };
}

export const adminStudentsService = {
  async list({ q, sectionId }) {
    const yearId = await adminStudentsRepository.findActiveYearId();
    const [students, guardians] = await Promise.all([
      adminStudentsRepository.list({ q, sectionId, yearId }),
      adminStudentsRepository.guardiansByStudent(),
    ]);
    return students.map((student) => ({ ...student, guardians: guardians.get(student.id) ?? [] }));
  },

  async get(studentId) {
    const yearId = await adminStudentsRepository.findActiveYearId();
    const [student] = await adminStudentsRepository.list({ studentId, yearId });
    if (!student) throw AppError.notFound('Estudiante no encontrado');
    const guardians = await adminStudentsRepository.guardiansByStudent();
    return { ...student, guardians: guardians.get(student.id) ?? [] };
  },

  /** Expediente + (opcional) cuenta con contraseña temporal + (opcional) inscripción. */
  async create({ code, firstName, lastName, birthDate, email, sectionId }) {
    const yearId = sectionId ? await requireActiveYear() : null;

    const { studentId, temporaryPassword } = await withTransaction(async (connection) => {
      const repo = adminStudentsRepository.withConnection(connection);
      const id = await withCodeCheck(() => repo.insert({ code, firstName, lastName, birthDate }));

      let password = null;
      if (email) {
        const account = await createAccount({ role: 'STUDENT', email, firstName, lastName }, adminUsersRepository.withConnection(connection));
        await repo.linkAccount(id, account.id);
        password = account.temporaryPassword;
      }
      if (sectionId) await applyEnrollment(connection, id, sectionId, yearId);
      return { studentId: id, temporaryPassword: password };
    });

    return { student: await this.get(studentId), temporaryPassword };
  },

  async update(studentId, changes) {
    if (!(await adminStudentsRepository.findStudent(studentId))) throw AppError.notFound('Estudiante no encontrado');
    await withCodeCheck(() => adminStudentsRepository.update(studentId, changes));
    return this.get(studentId);
  },

  async createAccount(studentId, { email }) {
    const student = await adminStudentsRepository.findStudent(studentId);
    if (!student) throw AppError.notFound('Estudiante no encontrado');
    if (student.userId) throw AppError.conflict('HAS_ACCOUNT', 'El estudiante ya tiene una cuenta; restablece su contraseña si la olvidó');

    const temporaryPassword = await withTransaction(async (connection) => {
      const account = await createAccount(
        { role: 'STUDENT', email, firstName: student.firstName, lastName: student.lastName },
        adminUsersRepository.withConnection(connection),
      );
      await adminStudentsRepository.withConnection(connection).linkAccount(studentId, account.id);
      return account.temporaryPassword;
    });
    return { student: await this.get(studentId), temporaryPassword };
  },

  async setEnrollment(studentId, sectionId) {
    if (!(await adminStudentsRepository.findStudent(studentId))) throw AppError.notFound('Estudiante no encontrado');
    const yearId = await requireActiveYear();
    const result = await withTransaction((connection) => applyEnrollment(connection, studentId, sectionId, yearId));
    return { ...result, student: await this.get(studentId) };
  },

  async linkGuardian(studentId, data) {
    if (!(await adminStudentsRepository.findStudent(studentId))) throw AppError.notFound('Estudiante no encontrado');
    if (!(await adminStudentsRepository.findParent(data.guardianId))) throw AppError.notFound('La persona no es un usuario de familia');
    await adminStudentsRepository.upsertGuardian(studentId, data);
    return this.get(studentId);
  },

  async unlinkGuardian(studentId, guardianId) {
    if (!(await adminStudentsRepository.removeGuardian(studentId, guardianId))) throw AppError.notFound('Vínculo no encontrado');
    return this.get(studentId);
  },
};
