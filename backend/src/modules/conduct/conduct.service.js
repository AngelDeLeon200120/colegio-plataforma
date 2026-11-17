import { AppError } from '../../core/errors/AppError.js';
import { withTransaction } from '../../core/db/transaction.js';
import { formatLocalDateTime, localClock } from '../../core/utils/dates.js';
import { emitToRoom } from '../../realtime/emitter.js';
import { rooms } from '../../realtime/rooms.js';
import { academicRepository } from '../academic/academic.repository.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { FOLLOWUP_THRESHOLD, conductRepository } from './conduct.repository.js';

export const CATEGORY_LABELS = {
  LLEGADA_TARDE: 'Llegada tarde',
  FALTA_RESPETO: 'Falta de respeto',
  INDISCIPLINA: 'Indisciplina en clase',
  CELULAR: 'Sacó el celular',
  TAREA_COPIADA: 'Tarea copiada',
  OTRO: 'Otro',
};

export const DECISION_LABELS = {
  CITA_FAMILIA: 'Citación a la familia',
  REUNION_TUTOR: 'Reunión con el tutor',
  OTRA: 'Otra medida',
};

const STAFF = ['TEACHER', 'ADMIN'];

export const STAGE_LABELS = { AVISO: 'Aviso', ESCRITO: 'Reporte escrito', REUNION: 'Reunión con tutores o familia' };

/** Etapa según cuántos reportes lleva en el ciclo: 1 aviso, 2 escrito, 3 reunión; 4 aviso otra vez... */
export const stageFor = (count) => ['AVISO', 'ESCRITO', 'REUNION'][(count - 1) % FOLLOWUP_THRESHOLD];
const excerpt = (text, max = 160) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

// Refresca las pantallas de conducta abiertas (sin datos: cada quien vuelve a pedir lo que puede ver)
const announce = (user) => emitToRoom(rooms.school(user.schoolId), 'conduct:changed', {});

async function activeYear() {
  const yearId = await conductRepository.findActiveYearId();
  if (!yearId) throw AppError.unprocessable('NO_ACTIVE_YEAR', 'No hay un ciclo lectivo activo');
  return yearId;
}

async function schoolToday() {
  const timeZone = await academicRepository.findSchoolTimezone();
  return { timeZone, today: localClock(new Date(), timeZone).date };
}

/** La familia solo ve a sus hijos e hijas (y el docente no se puede ver aquí). */
async function resolveFamilyStudent(user, studentId) {
  if (!(await conductRepository.isGuardian(user.id, studentId))) throw AppError.notFound('Estudiante no encontrado');
}

/** Para la familia: sin notas internas de la institución. */
const forFamily = ({ notes, handledBy, ...followup }) => followup;

export const conductService = {
  /** Estudiantes que la persona puede reportar, con su contador del ciclo. */
  async students(user, { sectionId }) {
    const yearId = await activeYear();
    return { threshold: FOLLOWUP_THRESHOLD, students: await conductRepository.listStudents(user, yearId, { sectionId }) };
  },

  async reports(user, filters) {
    const yearId = await activeYear();
    return { reports: await conductRepository.listReports(user, yearId, filters), canVoid: user.role === 'ADMIN' };
  },

  /**
   * Nuevo reporte. Avisa a la familia y, si el estudiante llega a 3 (6, 9...) reportes en el ciclo,
   * abre un seguimiento y avisa a la administración y al docente guía.
   */
  async create(user, { studentId, category, description, incidentDate }) {
    const yearId = await activeYear();
    const student = await conductRepository.findEnrolledStudent(studentId, yearId);
    if (!student) throw AppError.notFound('Estudiante no encontrado en el ciclo activo');
    if (!(await conductRepository.canReportInSection(user, student.sectionId))) {
      throw AppError.forbidden('Solo puedes reportar a estudiantes de tus secciones');
    }
    const { today } = await schoolToday();
    if (incidentDate > today) throw AppError.validation([{ field: 'incidentDate', issue: 'La fecha no puede ser futura' }]);

    const result = await withTransaction(async (connection, afterCommit) => {
      const repo = conductRepository.withConnection(connection);
      const before = await repo.countActiveForUpdate(student.id, yearId);
      const count = before + 1;
      // 1.º aviso · 2.º reporte escrito · 3.º reunión con tutores o familia (y se repite)
      const stage = stageFor(count);
      const reportId = await repo.insertReport({
        yearId,
        studentId: student.id,
        sectionId: student.sectionId,
        category,
        description,
        stage,
        incidentDate,
        reportedBy: user.id,
      });
      const followupId = stage === 'REUNION' ? await repo.openFollowup({ yearId, studentId: student.id, reportCount: count }) : null;

      const name = `${student.firstName} ${student.lastName}`;
      const guardians = await repo.findGuardianIds(student.id);
      const familyNotice = {
        AVISO: {
          priority: 'NORMAL',
          title: `Aviso de conducta de ${student.firstName}: ${CATEGORY_LABELS[category]}`,
          body: `${excerpt(description)} · Primer aviso del ciclo. Si se repite, quedará como reporte escrito.`,
        },
        ESCRITO: {
          priority: 'HIGH',
          title: `Reporte escrito de ${student.firstName}: ${CATEGORY_LABELS[category]}`,
          body: `${excerpt(description)} · Queda como reporte escrito en su expediente. Al siguiente, la institución citará a reunión con la familia.`,
        },
        REUNION: {
          priority: 'HIGH',
          title: `Reporte de conducta de ${student.firstName}: ${CATEGORY_LABELS[category]}`,
          body: `${excerpt(description)} · Es el ${count}.º reporte del ciclo.`,
        },
      }[stage];
      const notifications = await notificationsService.createForUsers(connection, guardians, {
        type: stage === 'ESCRITO' ? 'CONDUCT_WRITTEN' : 'CONDUCT_REPORT',
        ...familyNotice,
        entityType: 'conduct_report',
        entityId: reportId,
        studentId: student.id,
        actionUrl: `/my/conduct?student=${student.id}`,
        dedupeKey: `conduct:${reportId}`,
      });

      if (followupId) {
        notifications.push(
          ...(await notificationsService.createForUsers(connection, guardians, {
            type: 'CONDUCT_FOLLOWUP',
            priority: 'HIGH',
            title: `Reunión con la familia: ${student.firstName} llegó a ${count} reportes`,
            body: 'La institución citará a una reunión con los tutores o la familia. Les avisaremos la fecha.',
            entityType: 'conduct_followup',
            entityId: followupId,
            studentId: student.id,
            actionUrl: `/my/conduct?student=${student.id}`,
            dedupeKey: `conduct-followup:${followupId}`,
          })),
        );
        const staff = [...new Set([...(await repo.findAdminIds()), student.homeroomTeacherId].filter(Boolean))];
        notifications.push(
          ...(await notificationsService.createForUsers(connection, staff, {
            type: 'CONDUCT_FOLLOWUP',
            priority: 'HIGH',
            title: `${name} (${student.sectionName}) llegó a ${count} reportes`,
            body: 'Programar la reunión con los tutores o la familia (o decidir otra medida).',
            entityType: 'conduct_followup',
            entityId: followupId,
            actionUrl: `/conduct?tab=followups`,
            dedupeKey: `conduct-followup-staff:${followupId}`,
          })),
        );
      }

      afterCommit(() => {
        notificationsService.publish(notifications);
        announce(user);
      });
      return { id: reportId, reportCount: count, stage, followupOpened: Boolean(followupId), threshold: FOLLOWUP_THRESHOLD };
    });
    return result;
  },

  /** Solo la administración: el reporte no se borra, queda anulado con motivo y deja de contar. */
  async void(user, reportId, { reason }) {
    const report = await conductRepository.findReport(reportId);
    if (!report) throw AppError.notFound('Reporte no encontrado');
    if (!(await conductRepository.voidReport(reportId, { reason, voidedBy: user.id }))) {
      throw AppError.unprocessable('ALREADY_VOID', 'El reporte ya estaba anulado');
    }
    announce(user);
    return { id: reportId, status: 'VOID' };
  },

  async followups(user, { status }) {
    const yearId = await activeYear();
    return { followups: await conductRepository.listFollowups(user, yearId, { status }), canManage: user.role === 'ADMIN' };
  },

  /**
   * La institución decide: programa la citación o reunión (avisa a la familia con la fecha)
   * y, después, registra los acuerdos y lo marca resuelto.
   */
  async updateFollowup(user, followupId, changes) {
    const current = await conductRepository.findFollowup(followupId);
    if (!current) throw AppError.notFound('Seguimiento no encontrado');
    if (changes.status === 'PROGRAMADO' && !(changes.decision ?? current.decision)) {
      throw AppError.validation([{ field: 'decision', issue: 'Elige la medida' }]);
    }

    const scheduling = changes.meetingAt && (!current.meetingAt || new Date(changes.meetingAt).getTime() !== new Date(current.meetingAt).getTime());
    await withTransaction(async (connection, afterCommit) => {
      const repo = conductRepository.withConnection(connection);
      await repo.updateFollowup(followupId, changes, user.id);
      if (!scheduling) {
        afterCommit(() => announce(user));
        return;
      }
      // Citación con fecha: la familia la recibe
      const { timeZone } = await schoolToday();
      const decision = DECISION_LABELS[changes.decision ?? current.decision] ?? 'Reunión';
      const guardians = await repo.findGuardianIds(current.studentId);
      const notifications = await notificationsService.createForUsers(connection, guardians, {
        type: 'CONDUCT_FOLLOWUP',
        priority: 'HIGH',
        title: `${decision}: ${formatLocalDateTime(changes.meetingAt, timeZone)}`,
        body: 'La institución los cita para dar seguimiento a los reportes de conducta.',
        entityType: 'conduct_followup',
        entityId: followupId,
        studentId: current.studentId,
        actionUrl: `/my/conduct?student=${current.studentId}`,
        dedupeKey: `conduct-meeting:${followupId}:${new Date(changes.meetingAt).getTime()}`,
      });
      afterCommit(() => {
        notificationsService.publish(notifications);
        announce(user);
      });
    });
    return conductRepository.findFollowup(followupId);
  },

  /** Vista de la familia: reportes vigentes, contador y seguimientos (sin notas internas). */
  async family(user, { studentId }) {
    await resolveFamilyStudent(user, studentId);
    const yearId = await activeYear();
    const [reports, followups] = await Promise.all([
      conductRepository.listStudentReports(studentId, yearId),
      conductRepository.listStudentFollowups(studentId, yearId),
    ]);
    return {
      threshold: FOLLOWUP_THRESHOLD,
      reportCount: reports.length,
      reports: reports.map(({ reportedBy, ...report }) => ({ ...report, reportedBy: { name: reportedBy.name } })),
      followups: followups.map(forFamily),
    };
  },
};

export const isStaff = (user) => STAFF.includes(user.role);
