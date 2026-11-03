# 02 · Guía de API REST y WebSockets

## 1. Convenciones

| Tema | Regla |
|---|---|
| Base | `/api/v1` · JSON · `camelCase` en payloads (`snake_case` solo en SQL) |
| Auth | `Authorization: Bearer <accessToken>` (JWT, 15 min). Refresh token en cookie `httpOnly; Secure; SameSite=Strict`, 30 días, rotado en cada uso |
| JWT | `{ sub: userId, sid: schoolId, role, tv: tokenVersion }`. **El tenant sale solo de aquí** |
| Recursos de otro colegio | `404`, nunca `403` (no revelar existencia) |
| Paginación | Por cursor: `?limit=25&cursor=<opaque>` → `{ data, nextCursor }` |
| Fechas | ISO-8601 en UTC; el cliente formatea con `school.timezone` |
| Transiciones de estado | Endpoints de acción (`POST /submissions/:id/reject`), no `PATCH { status }`, para que la máquina de estados viva en el servicio |
| Concurrencia | Recursos revisables llevan `version`; si no coincide → `409 VERSION_CONFLICT` |
| Idempotencia | `Idempotency-Key` en `POST /payments` y en entregas con archivos |

**Formato de error (único, desde `errorHandler`)**

```json
{
  "error": {
    "code": "INVALID_TRANSITION",
    "message": "Solo se puede rechazar una entrega en estado SUBMITTED",
    "details": [{ "field": "feedback", "issue": "required" }],
    "requestId": "b3f1c2..."
  }
}
```

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Esquema zod inválido |
| 401 | `UNAUTHENTICATED` / `TOKEN_EXPIRED` / `SESSION_REVOKED` | Sin token, token vencido, o sesión cerrada (`tv` desactualizado, cuenta deshabilitada) |
| 401 | `INVALID_CREDENTIALS` | Login fallido (mismo mensaje y tiempo exista o no el usuario) |
| 401 | `REFRESH_MISSING` / `REFRESH_EXPIRED` / `REFRESH_REUSED` | Renovación sin cookie, vencida, o con un token ya rotado (posible robo: se cierra esa sesión) |
| 403 | `ACCOUNT_DISABLED` / `SCHOOL_SUSPENDED` | Credenciales correctas pero sin acceso |
| 403 | `FORBIDDEN` | Rol sin permiso sobre un recurso **de su colegio** |
| 404 | `NOT_FOUND` | No existe o es de otro colegio |
| 409 | `VERSION_CONFLICT` / `DUPLICATE` | Edición concurrente, clave única |
| 413 / 415 | `FILE_TOO_LARGE` / `UNSUPPORTED_MEDIA_TYPE` | Subida de archivos |
| 422 | `INVALID_TRANSITION` / `UNIT_CLOSED` / `UNIT_NOT_VISIBLE` / `SCORE_OUT_OF_RANGE` | Regla de negocio |
| 429 | `RATE_LIMITED` | Login y subidas |

Roles abreviados en las tablas: **A** Admin · **T** Profesor · **S** Alumno · **P** Padre.
"T*" = solo profesor asignado al curso. "S*" / "P*" = solo el propio alumno / sus hijos.

---

## 2. Endpoints REST por módulo

### 2.1 Auth

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/auth/login` | público | `{ schoolSlug, email, password }` → `{ accessToken, user }` + cookie refresh |
| POST | `/auth/refresh` | cookie | Rota el refresh; reutilizar uno revocado invalida toda la familia |
| POST | `/auth/logout` | todos | Revoca el refresh actual |
| POST | `/auth/logout-all` | todos | Incrementa `token_version` → cierra todas las sesiones |
| GET | `/auth/me` | todos | Usuario, colegio, rol; para P incluye `children[]` |
| PATCH | `/auth/me/password` | todos | `{ currentPassword, newPassword }` |
| POST | `/auth/password/forgot` · `/auth/password/reset` | público | Flujo por email con token de un solo uso |

### 2.2 Usuarios, alumnos y encargados

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/admin/users?role=&q=` | A | Docentes, familias y administración (las cuentas de estudiantes van en su expediente). Familias con `children[]`, docentes con `courseCount` |
| POST | `/admin/users` | A | `{ role, firstName, lastName, email, phone? }` → `{ user, temporaryPassword }` (se muestra una sola vez). `409 EMAIL_TAKEN` |
| PATCH | `/admin/users/:id` | A | Datos y `status`. Deshabilitar cierra todas sus sesiones al instante; no se puede deshabilitar la propia cuenta |
| POST | `/admin/users/:id/reset-password` | A | Nueva contraseña temporal; cierra todas sus sesiones |
| PATCH | `/auth/me/password` | todos | `{ currentPassword, newPassword }` (mín. 8) |
| GET | `/admin/students?q=&sectionId=` | A | Expedientes con cuenta, inscripción del ciclo activo y familia |
| POST | `/admin/students` | A | `{ code, firstName, lastName, birthDate?, sectionId?, email? }`: con `email` crea la cuenta (contraseña temporal), con `sectionId` lo inscribe. `409 CODE_TAKEN` |
| PATCH | `/admin/students/:id` | A | Datos del expediente |
| POST | `/admin/students/:id/account` | A | Crea la cuenta de un expediente que no la tenía |
| PUT | `/admin/students/:id/enrollment` | A | `{ sectionId }` inscribe o traslada; `null` retira. Apaga recordatorios de la sección anterior y crea entregas `PENDING` de las tareas vigentes de la nueva |
| POST · DELETE | `/admin/students/:id/guardians[/:guardianId]` | A | Vincula `{ guardianId, relationship, isFinancialResponsible, receivesNotifications }` (solo usuarios `PARENT`) / desvincula |

### 2.3 Estructura académica

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/admin/academic` | A | Ciclo activo con unidades, grados, secciones (con estudiantes), materias, cursos y docentes. Cada alta o cambio de abajo responde con esta misma estructura |
| POST | `/admin/academic/units` | A | `{ name, startsOn, endsOn }`; el número de unidad es el siguiente |
| POST | `/admin/academic/units/:id/activate` · `close` · `reopen` | A | `SCHEDULED → ACTIVE`, `ACTIVE → CLOSED`, `CLOSED → ACTIVE`. Una sola activa por ciclo (`409 UNIT_ALREADY_ACTIVE`). Emite `unit:status_changed` |
| POST | `/admin/academic/grade-levels` · `sections` · `subjects` | A | Catálogos (duplicados → `409` con mensaje claro) |
| POST · PATCH | `/admin/academic/courses[/:id]` | A | Sección + materia + docente; `PATCH { teacherId, isActive }` reasigna |
| GET | `/me/courses` | T, A | Cursos del ciclo activo (docente: los asignados) |

Pendiente: crear o cerrar el ciclo lectivo desde la interfaz (hoy se hace en la base de datos).

### 2.4 Cuadro de notas (estilo Excel)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/courses/:id/gradebook?unitId=` | A, T* | Hoja completa: `{ unit, items[], students[], scores{ "itemId:studentId": cell }, totals }` |
| POST | `/courses/:id/grade-items` | T* | Nueva columna `{ unitId, name, maxScore, weight, activityId? }` |
| PATCH · DELETE | `/grade-items/:id` | T* | Edita / borra columna (borrar con notas exige `?force=true`) |
| POST | `/courses/:id/grade-items/reorder` | T* | `{ unitId, order: [itemId…] }` |
| PUT | `/courses/:id/gradebook/scores` | T* | **Guardado por lotes** (pegado multi-celda, autosave) — ver abajo |
| PATCH | `/grade-items/:id` `{ isPublished }` | T* | Hace visible (u oculta) la columna para S/P. Pendiente: notificar al publicar |
| GET | `/me/courses` | T, A | Cursos del ciclo activo (docente: los asignados) con número de estudiantes |
| GET | `/courses/:id/gradebook/template?unitId=&format=xlsx\|csv` | T* | Plantilla con códigos de alumno, columnas y fila oculta de metadatos (`courseId`, `unitId`, `itemIds`) |
| POST | `/courses/:id/gradebook/imports` | T* | `multipart` (`file`, `unitId`) → **fase 1: valida, no escribe** |
| GET | `/grade-imports/:id` | T* | Resumen y errores por fila |
| POST | `/grade-imports/:id/apply` | T* | **Fase 2**: escribe en una transacción |
| POST | `/grade-imports/:id/discard` | T* | Descarta |
| GET | `/me/report-card?studentId=&unitId=` | S, P* | Boleta: solo columnas publicadas y unidades no futuras. Por materia: `total` (zona sobre 100), `published` (puntos publicados) y `percent` (rendimiento sobre lo publicado), más `average`, `complete` y el resumen del ciclo por unidad |

Al aprobar una entrega con nota, si su actividad tiene columna ligada (`grade_items.activity_id`) la nota
se copia ahí (proporcional si los máximos difieren; no si la unidad está cerrada). Una actividad nueva crea
esa columna con `gradeWeight`.

**`PUT /courses/:id/gradebook/scores`**

```json
// Request (máx. 2 000 celdas)
{
  "unitId": 12,
  "cells": [
    { "gradeItemId": 88, "studentId": 301, "score": 18.5 },
    { "gradeItemId": 88, "studentId": 302, "score": null, "isExcused": true }
  ]
}
// 200 → { "saved": 2, "cells": [{ "gradeItemId": 88, "studentId": 301, "score": 18.5, "updatedAt": "..." }] }
// 422 → { "error": { "code": "SCORE_OUT_OF_RANGE",
//         "details": [{ "gradeItemId": 88, "studentId": 302, "issue": "max 20" }] } }
```

Reglas: todo o nada; cada `studentId` debe tener inscripción activa en la sección del curso;
`0 ≤ score ≤ maxScore`; unidad `CLOSED` → `422 UNIT_CLOSED`. Se escribe con
`INSERT … ON DUPLICATE KEY UPDATE` y se emite `gradebook:cells_updated` a los demás editores.

**Validación del archivo importado** (`row.validator.js`), errores devueltos como
`{ row, column, code, message }`:

| Código | Regla |
|---|---|
| `TEMPLATE_MISMATCH` | Metadatos ocultos no coinciden con curso/unidad, o columnas alteradas |
| `UNKNOWN_STUDENT_CODE` | Código no existe en el colegio |
| `STUDENT_NOT_IN_SECTION` | Existe pero no está inscrito en la sección |
| `DUPLICATE_STUDENT` | Mismo código repetido en el archivo |
| `NOT_A_NUMBER` | Celda no numérica (acepta coma decimal `18,5`) |
| `SCORE_OUT_OF_RANGE` | Fuera de `0..maxScore` |
| `TOO_MANY_DECIMALS` | Más de 2 decimales |

Límites: `.xlsx` o `.csv`, ≤ 2 MB, ≤ 1 000 filas. Celdas vacías = "sin cambio" (no borran).
Cada encabezado de nota lleva el id de la columna (`Examen (/100) [#12]`): así se valida que el archivo
es de este curso y unidad, también en CSV. El CSV acepta `;`, `,` o tabulador como separador.

Estados de `grade_imports`: `VALIDATED` (sin errores) → `APPLIED`, o `REJECTED` (con errores, no se puede aplicar),
o `DISCARDED`. Al aplicar se revalida todo; si la hoja cambió desde la validación → `409 IMPORT_STALE`.

### 2.5 Actividades

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/teacher/activities?courseId=&status=` | T, A | Actividades del ciclo activo (docente: sus cursos) con `progress { total, submitted, rejected, pending, approved }` y `resourceCount` |
| POST | `/courses/:id/activities` | T* | `multipart`: `title, description?, type, unitId?, dueAt?, maxScore?, allowLate, publish` + `files[]` (material, hasta 5). Crea en `DRAFT`; con `publish=true` la publica en la misma transacción. Unidad por defecto: la activa; nunca una cerrada |
| PATCH | `/activities/:id` | T* | `{ title, description, dueAt, allowLate, maxScore }`. Si cambia el plazo de una publicada, se mueven los recordatorios de lo pendiente |
| POST | `/activities/:id/publish` | T* | `DRAFT → PUBLISHED`; crea `submissions PENDING` por inscrito y notifica a los estudiantes (`ACTIVITY_PUBLISHED`) |
| POST | `/activities/:id/close` | T* | `PUBLISHED → CLOSED`: no acepta entregas y el job apaga sus recordatorios |
| POST | `/activities/:id/reopen` | T* | `CLOSED → PUBLISHED`: vuelve a recibir entregas; las pendientes retoman sus recordatorios desde la fecha de entrega y las rechazadas de inmediato. `422 UNIT_CLOSED` si la unidad está cerrada |
| DELETE | `/activities/:id` | T* | Borrador: se borra del todo. Cerrada: borrado lógico (`deleted_at`), deja de verse para docentes, estudiantes y familias; sus entregas y las notas ya copiadas al cuadro se conservan. Una publicada primero se cierra (`422 INVALID_TRANSITION`) |

La vista del estudiante y la familia está en 2.6 (`/me/activities`).

### 2.6 Entregas y revisión

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/activities/:id/submissions?status=` | T* | Cola de revisión con alumno, intento actual y `isLate` |
| GET | `/activities/:id/submissions/summary` | T* | Conteo por estado (para badges) |
| GET | `/submissions/:id` | T*, S*, P* | Detalle: intentos, archivos, historial de revisiones |
| POST | `/submissions/:id/approve` | T* | `{ score?, feedback?, version }` → `APPROVED`, `next_reminder_at = NULL` |
| POST | `/submissions/:id/reject` | T* | `{ feedback (obligatorio), version }` → `REJECTED`, `next_reminder_at = now + intervalo` |
| GET | `/me/activities?studentId=` | S, P* | Agenda: actividades visibles (publicadas, liberadas, unidad no futura) con el estado de la entrega. Familia: `studentId` obligatorio |
| GET | `/me/activities/:id?studentId=` | S, P* | Detalle: instrucciones, material, intentos, revisiones, `canSubmit` y `submitBlocker` |
| POST | `/me/activities/:id/attempts` | S | `multipart`: `files[]` (1 a 5, ≤ 20 MB c/u) + `comment?` → nuevo intento, `SUBMITTED`, notifica al docente |

Bloqueos de entrega (`422`): `ALREADY_SUBMITTED`, `ACTIVITY_CLOSED`, `LATE_NOT_ALLOWED`, `NO_SUBMISSION_REQUIRED`.
Formatos: PDF, imágenes (incluye HEIC de iPhone), Word, Excel, PowerPoint y ZIP; se verifica el contenido real.

Transiciones válidas (`submission.stateMachine.js`); cualquier otra → `422 INVALID_TRANSITION`:

| Desde | Acción | Hacia | Quién |
|---|---|---|---|
| `PENDING` | entregar | `SUBMITTED` | S (si `dueAt` pasó y `allowLate=false` → 422) |
| `REJECTED` | reenviar | `SUBMITTED` | S |
| `SUBMITTED` | aprobar | `APPROVED` | T* |
| `SUBMITTED` | rechazar | `REJECTED` | T* |

### 2.7 Archivos

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/files` | todos | `multipart` (`file`, `purpose`) → `{ id, name, size, mimeType }`. Proveedor local |
| POST | `/files/presign` | todos | S3: `{ name, mimeType, size, purpose }` → `{ fileId, uploadUrl, fields }` |
| POST | `/files/:id/complete` | dueño | S3: confirma la subida (verifica tamaño real) |
| GET | `/files/:id/url` | según relación | `{ url, expiresIn }`: URL firmada de 5 min. Autoriza: administración, quien lo subió, docente del curso, estudiante dueño y su familia; material de actividad: la sección inscrita. Sin relación → `404` |
| GET | `/files/:id/content?token=` | público (token) | Sirve el archivo. PDF e imágenes `inline`, el resto como descarga; CSP `sandbox`. `410 LINK_EXPIRED` / `403 INVALID_LINK` |

Whitelist de MIME para entregas: PDF, imágenes, Office, ZIP. Máx. 20 MB por archivo, 5 por intento.
Se valida la firma real del archivo (magic bytes), no solo la extensión.

### 2.8 Notificaciones

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/notifications?cursor=&unread=true&limit=20` | todos | Bandeja propia, cursor por id descendente → `{ items, nextCursor, unreadCount }`. Cada ítem trae `studentName` (útil para familias con varios hijos) |
| GET | `/notifications/unread-count` | todos | `{ count }` para la campana |
| POST | `/notifications/read` | todos | `{ ids: [...] }` (máx. 100). Ids ajenos se ignoran. Emite `notification:read` y `notification:unread_count` a las otras pestañas |
| POST | `/notifications/read-all` | todos | Marca todo como leído |

Al reconectar el socket, el cliente vuelve a pedir la primera página y el contador:
así recupera lo que llegó sin conexión.

### 2.8b Mensajes

Hilos con asunto entre familias, estudiantes y el personal. Asuntos: `TAREAS` y `AUSENCIA`, con motivo
`LLEGA_TARDE`, `SIN_UNIFORME`, `VACACIONES`, `FALLECIMIENTO` o `ENFERMEDAD`.

- **Sobre un estudiante** (`scope: STUDENT`): lo ven el estudiante, sus familias, los docentes de su sección y la administración; todos responden.
- **Aviso a la sección** (`scope: SECTION`): solo lo envía el personal (docente de la sección o administración); lo leen estudiantes y familias, y solo el personal responde.

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/messages/threads?topic=&reason=` | todos | Bandeja (máx. 200, más recientes primero) → `{ threads, unreadCount }`. Cada hilo trae `unread` y el último mensaje |
| GET | `/messages/unread-count` | todos | `{ count }` de hilos con mensajes ajenos sin leer (contador del menú) |
| GET | `/messages/recipients` | todos | A quién puede escribir: personal → `{ canMessageSection: true, sections, students }`; familia y estudiante → sus estudiantes |
| POST | `/messages/threads` | todos | `{ scope, studentId \| sectionId, topic, reason?, subject, body }`. `reason` es obligatorio con `AUSENCIA`. Estudiante ajeno o sin inscripción activa → `404`; familia o estudiante con `SECTION` → `403` |
| GET | `/messages/threads/:id` | quien lo ve | `{ thread (con canReply), messages }`. Lo marca leído y emite `message:read` |
| POST | `/messages/threads/:id/messages` | quien lo ve | `{ body }`. En un aviso a la sección, solo el personal (`403` para los demás) |

Cada mensaje crea una notificación `MESSAGE` para quienes ven el hilo (menos el autor) y emite `message:new`.

### 2.9 Finanzas

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/me/finance?studentId=` | P* | Estado de cuenta: `{ student, school, summary{ totalDue, overdue, nextDue, paidTotal }, charges[], payments[] }` (sin cargos anulados) |
| GET | `/finance/students?q=` | A | Cartera del ciclo activo: saldo, vencido y fecha pendiente más antigua por estudiante, morosos primero, más totales |
| GET | `/finance/students/:id` | A | Estado de cuenta (incluye anulados) |
| GET · POST · PATCH | `/finance/fee-concepts[/:id]` | A | Conceptos (colegiatura, inscripción, bus…) |
| POST | `/finance/charges/generate` | A | Masivo `{ feeConceptId, periodLabel, description, amount?, dueDate, sectionIds? }` → `{ created, skipped }`. Idempotente por `uq_charges_period` |
| PATCH | `/finance/charges/:id` | A | `{ discount?, lateFee? }`; recalcula el estado |
| POST | `/finance/charges/:id/void` | A | Anula (solo sin pagos) |
| POST | `/finance/payments` | A | `{ studentId, amount, method, reference?, paidAt?, notes?, allocations?[] }`. Sin `allocations` se aplica del cargo más antiguo al más reciente. `422 OVERPAYMENT` si supera el saldo; `409 DUPLICATE_PAYMENT` si se repite la referencia en 10 min. Avisa a los encargados financieros |
| POST | `/finance/payments/:id/reverse` | A | `{ reason }`: devuelve el saldo a sus cargos; el pago queda como `REVERSED` con el motivo |

Montos en centavos enteros en el servidor; los cargos se bloquean (`FOR UPDATE`) al aplicar un pago.
El recibo se imprime (o guarda como PDF) desde el navegador. Pendiente: reporte de morosidad por antigüedad.

### 2.10 Operación

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/health` · `/ready` | público | Liveness / readiness (incluye ping a MySQL) |
| GET | `/admin/jobs/runs?job=` | A | Historial de `job_runs` del colegio |
| GET | `/admin/audit-logs?entityType=&entityId=` | A | Auditoría |

---

## 3. WebSockets (Socket.io)

### 3.1 Conexión y salas

```js
// Cliente
const socket = io(API_URL, { auth: { token: accessToken }, transports: ['websocket'] });
socket.on('connect_error', async (err) => {
  if (err.data?.code === 'TOKEN_EXPIRED') {
    socket.auth.token = await refreshAccessToken();
    socket.connect();
  }
});
```

- Middleware `io.use()` verifica el JWT (incluido `tv`) y que el colegio esté `ACTIVE`.
- **El servidor decide las salas**; el cliente nunca se une a una sala arbitraria.

| Sala | Miembros | Uso |
|---|---|---|
| `user:{userId}` | Cada socket del usuario (varias pestañas/dispositivos) | Notificaciones personales |
| `school:{schoolId}` | Todos los del colegio | Avisos globales, cambio de unidad |
| `course:{courseId}:staff` | Profesor del curso y admins, a demanda | Hoja de notas colaborativa, cola de revisión |

Para entrar a `course:*:staff` el cliente emite `course:subscribe` y el servidor
verifica la asignación antes de hacer `join`.

### 3.2 Sobre de eventos

Todos los eventos servidor → cliente comparten la misma forma:

```json
{
  "id": "evt_01JC8...",
  "type": "notification:new",
  "occurredAt": "2026-11-02T14:05:00Z",
  "data": { }
}
```

`id` permite al cliente descartar duplicados (reconexiones, varias réplicas).

### 3.3 Servidor → cliente

| Evento | Sala | `data` | Efecto en la UI |
|---|---|---|---|
| `notification:new` | `user:` | `{ notification }` (misma forma que REST) | Toast según prioridad + prepend en la bandeja |
| `notification:unread_count` | `user:` | `{ count }` | Badge de la campana |
| `notification:read` | `user:` | `{ ids \| "all" }` | Sincroniza leídas entre pestañas |
| `submission:updated` | `user:` del alumno y encargados; `course:*:staff` | `{ submissionId, activityId, studentId, status, attemptCount, version }` | Invalida queries de esa entrega |
| `activity:published` | `user:` de cada alumno de la sección | `{ activityId, courseId, title, dueAt }` | Invalida agenda |
| `gradebook:cells_updated` | `course:*:staff` | `{ courseId, unitId, cells[], updatedBy }` | Actualiza celdas en vivo (el cliente ignora las suyas y las que tiene editadas sin guardar) |
| `gradebook:items_changed` | `course:*:staff` | `{ courseId, unitId, updatedBy }` | Recarga columnas (creadas, editadas o borradas) |
| `unit:status_changed` | `school:` | `{ unitId, status }` | Refresca contenido visible / bloquea la hoja |
| `message:new` | `user:` de quienes ven el hilo (y el autor) | `{ threadId, messageId }` | Refresca bandeja, hilo abierto y contador |
| `message:read` | `user:` | `{ threadId }` | Sincroniza el contador de mensajes entre pestañas |
| `session:revoked` | `user:` | `{ reason }` | Cierra sesión en el cliente |

### 3.4 Cliente → servidor (con ack)

| Evento | Payload | Ack |
|---|---|---|
| `course:subscribe` | `{ courseId }` | `{ ok: true }` o `{ ok: false, code: "FORBIDDEN" }` |
| `course:unsubscribe` | `{ courseId }` | `{ ok: true }` |

Las mutaciones (marcar leído, guardar notas, revisar) van **siempre por REST**:
validación, auditoría y códigos de error en un solo lugar. El socket solo empuja cambios.

### 3.5 Garantías de entrega

1. **La base de datos es la fuente de verdad.** Se inserta en `notifications` y
   después se emite; el socket es solo un aviso rápido.
2. **Emitir después del `COMMIT`.** El servicio acumula los eventos durante la
   transacción y `emitter` los envía al confirmar. Si hay rollback, no sale nada.
3. **Recuperación.** Al reconectar, el cliente vuelve a pedir `GET /notifications` y el contador.
4. **Varias instancias.** `@socket.io/redis-adapter` para que una emisión llegue
   a sockets conectados a cualquier réplica.

---

## 4. Matriz de notificaciones

| Disparador | Origen | Destinatarios | `type` | Prioridad |
|---|---|---|---|---|
| Actividad publicada | `POST /activities/:id/publish` | Alumnos de la sección | `ACTIVITY_PUBLISHED` | NORMAL |
| Vence en 24 h, sin entregar | Cron | Alumno | `ACTIVITY_DUE_SOON` | NORMAL |
| Alumno entrega / reenvía | `POST …/attempts` | Profesor del curso | `SUBMISSION_RECEIVED` | NORMAL |
| Entrega aprobada | `POST …/approve` | Alumno + encargados | `SUBMISSION_APPROVED` | NORMAL |
| Entrega rechazada | `POST …/reject` | Alumno + encargados | `SUBMISSION_REJECTED` | HIGH |
| Vencida en `PENDING` (acepta tardías) | Cron diario | Alumno + encargados | `ACTIVITY_OVERDUE` | HIGH → URGENT desde el 3.er recordatorio |
| Vencida en `PENDING` (no acepta tardías) | Cron, una sola vez | Alumno + encargados | `ACTIVITY_MISSED` | HIGH |
| `REJECTED` sin reenviar | Cron (cada intervalo) | Alumno + encargados | `CORRECTION_PENDING` | HIGH → URGENT desde el 3.er recordatorio |
| Notas publicadas | `POST …/gradebook/publish` | Alumnos + encargados | `GRADES_PUBLISHED` | NORMAL |
| Unidad abierta | Cron / admin | Todo el colegio | `UNIT_OPENED` | LOW |
| Cargo vence en 5 días | Cron diario | Encargado financiero | `PAYMENT_DUE_SOON` | NORMAL |
| Cargo vencido | Cron diario (pasa a `OVERDUE`) | Encargado financiero | `PAYMENT_OVERDUE` | HIGH |
| Pago registrado | `POST /payments` | Encargado financiero | `PAYMENT_RECEIVED` | NORMAL |
| Mensaje nuevo o respuesta | `POST /messages/…` | Quienes ven el hilo, menos el autor | `MESSAGE` | NORMAL (HIGH si es por fallecimiento) |

`dedupe_key` por regla, para que reintentar un job no duplique:
`{overdue|correction|missed}:{submissionId}:{n.º de aviso}`, `dueSoon:{submissionId}:{dueAt}`,
`pay-due:{chargeId}:{fecha}`, `message:{messageId}`.

## 5. Jobs programados

Código en `backend/src/jobs/`. Orden de ejecución dentro de un tick: la unidad primero, luego los avisos.

| Job | Horario (hora local del colegio) | Qué hace |
|---|---|---|
| `unitActivation` | Diario 00:15 | Activa la siguiente unidad `SCHEDULED` si llegó su `starts_on` **y no hay otra `ACTIVE`** (el cierre manual manda). Emite `unit:status_changed` |
| `submissionReminders` | Diario 07:00 | Lotes de 200 con `status IN ('PENDING','REJECTED') AND next_reminder_at <= ahora`. Corrección → `CORRECTION_PENDING`; vencida → `ACTIVITY_OVERDUE`, o `ACTIVITY_MISSED` una vez si no acepta tardías. Reprograma a +`REMINDER_INTERVAL_HOURS` (menos 30 min de margen). Apaga el ciclo si la actividad o la unidad se cerró o el estudiante se retiró |
| `dueSoonReminders` | Diario 16:00 | Entregas `PENDING` cuya actividad vence en las próximas 24 h |
| `paymentReminders` | Diario 08:00 | *Pendiente (módulo de finanzas)*: marcar `OVERDUE`, mora, avisar |

El ciclo de una entrega se detiene solo: al entregar, `next_reminder_at` queda en `NULL`;
si el docente rechaza, se reinicia con `reminder_count = 0`.

**Programador.** Un solo `node-cron` cada 15 min en UTC. Para cada colegio, ejecuta los
jobs cuya hora local ya pasó hoy; también al arrancar, así se pone al día si el servidor
estuvo apagado. `job_runs` (`UNIQUE job_name + school_id + run_key`, con `run_key` = fecha
local) asegura una sola ejecución por colegio y día aunque haya varias réplicas.
`JOBS_ENABLED=false` lo desactiva.

**Administración** (rol A, solo su colegio):

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/admin/jobs` | Jobs, horario y descripción |
| GET | `/admin/jobs/runs?job=` | Últimas 30 ejecuciones con estadísticas o error |
| POST | `/admin/jobs/:name/run` | Ejecuta ahora (clave `manual-<fecha ISO>`, no bloquea la diaria) |
