import { Router } from 'express';
import { authorize } from '../../core/middleware/authorize.js';
import { validate } from '../../core/middleware/validate.js';
import { academicAdminService } from './academic.admin.js';
import * as schemas from './admin.schemas.js';
import { adminStudentsService } from './students.service.js';
import { adminUsersService } from './users.service.js';

export const adminRouter = Router();

// Cualquier usuario: cambiar su propia contraseña
adminRouter.patch('/auth/me/password', validate({ body: schemas.changePasswordBody }), async (req, res) => {
  await adminUsersService.changeOwnPassword(req.user, req.valid.body);
  res.status(204).end();
});

// Todo lo demás: solo administración
for (const path of ['/admin/users', '/admin/students', '/admin/academic']) adminRouter.use(path, authorize('ADMIN'));

const params = validate({ params: schemas.idParams });

// --- Usuarios ----------------------------------------------------------------
adminRouter.get('/admin/users', validate({ query: schemas.listUsersQuery }), async (req, res) => {
  res.json({ data: await adminUsersService.list(req.valid.query) });
});
adminRouter.post('/admin/users', validate({ body: schemas.createUserBody }), async (req, res) => {
  res.status(201).json({ data: await adminUsersService.create(req.valid.body) });
});
adminRouter.patch('/admin/users/:id', validate({ params: schemas.idParams, body: schemas.updateUserBody }), async (req, res) => {
  res.json({ data: await adminUsersService.update(req.user, req.valid.params.id, req.valid.body) });
});
adminRouter.post('/admin/users/:id/reset-password', params, async (req, res) => {
  res.json({ data: await adminUsersService.resetPassword(req.valid.params.id) });
});

// --- Estudiantes -------------------------------------------------------------
adminRouter.get('/admin/students', validate({ query: schemas.listStudentsQuery }), async (req, res) => {
  res.json({ data: await adminStudentsService.list(req.valid.query) });
});
adminRouter.post('/admin/students', validate({ body: schemas.createStudentBody }), async (req, res) => {
  res.status(201).json({ data: await adminStudentsService.create(req.valid.body) });
});
adminRouter.patch('/admin/students/:id', validate({ params: schemas.idParams, body: schemas.updateStudentBody }), async (req, res) => {
  res.json({ data: await adminStudentsService.update(req.valid.params.id, req.valid.body) });
});
adminRouter.post('/admin/students/:id/account', validate({ params: schemas.idParams, body: schemas.studentAccountBody }), async (req, res) => {
  res.status(201).json({ data: await adminStudentsService.createAccount(req.valid.params.id, req.valid.body) });
});
adminRouter.put('/admin/students/:id/enrollment', validate({ params: schemas.idParams, body: schemas.enrollmentBody }), async (req, res) => {
  res.json({ data: await adminStudentsService.setEnrollment(req.valid.params.id, req.valid.body.sectionId) });
});
adminRouter.post('/admin/students/:id/guardians', validate({ params: schemas.idParams, body: schemas.guardianBody }), async (req, res) => {
  res.json({ data: await adminStudentsService.linkGuardian(req.valid.params.id, req.valid.body) });
});
adminRouter.delete('/admin/students/:id/guardians/:guardianId', validate({ params: schemas.studentGuardianParams }), async (req, res) => {
  res.json({ data: await adminStudentsService.unlinkGuardian(req.valid.params.id, req.valid.params.guardianId) });
});

// --- Estructura académica (cada cambio devuelve la estructura completa) --------
adminRouter.get('/admin/academic', async (req, res) => {
  res.json({ data: await academicAdminService.overview() });
});
adminRouter.post('/admin/academic/units', validate({ body: schemas.unitBody }), async (req, res) => {
  res.status(201).json({ data: await academicAdminService.createUnit(req.valid.body) });
});
adminRouter.post('/admin/academic/units/:id/:action', validate({ params: schemas.unitActionParams }), async (req, res) => {
  res.json({ data: await academicAdminService.changeUnitStatus(req.user, req.valid.params.id, req.valid.params.action) });
});
adminRouter.post('/admin/academic/grade-levels', validate({ body: schemas.gradeLevelBody }), async (req, res) => {
  res.status(201).json({ data: await academicAdminService.createGradeLevel(req.valid.body) });
});
adminRouter.post('/admin/academic/sections', validate({ body: schemas.sectionBody }), async (req, res) => {
  res.status(201).json({ data: await academicAdminService.createSection(req.valid.body) });
});
adminRouter.post('/admin/academic/subjects', validate({ body: schemas.subjectBody }), async (req, res) => {
  res.status(201).json({ data: await academicAdminService.createSubject(req.valid.body) });
});
adminRouter.post('/admin/academic/courses', validate({ body: schemas.courseBody }), async (req, res) => {
  res.status(201).json({ data: await academicAdminService.createCourse(req.valid.body) });
});
adminRouter.patch('/admin/academic/courses/:id', validate({ params: schemas.idParams, body: schemas.updateCourseBody }), async (req, res) => {
  res.json({ data: await academicAdminService.updateCourse(req.valid.params.id, req.valid.body) });
});
