# 01 · Arquitectura de la plataforma

SaaS multi-inquilino para colegios. Monorepo simple con tres raíces:

```
plataforma-colegio/
├── backend/        # API REST + Socket.io + cron (Node/Express)
├── frontend/       # SPA React + Vite + Tailwind
├── database/       # schema.sql, migraciones y seeds
└── docs/           # decisiones de arquitectura
```

---

## 1. Backend (Node.js + Express) — arquitectura en capas por módulo

Organización **por dominio (feature modules)**, no por tipo de archivo. Cada módulo
contiene sus propias capas: `routes → controller → service → repository`.

```
backend/
├── src/
│   ├── server.js                 # Arranque: HTTP + Socket.io + scheduler
│   ├── app.js                    # Express: helmet, cors, json, rutas, errorHandler
│   │
│   ├── config/
│   │   ├── env.js                # Carga y valida variables de entorno (zod)
│   │   ├── database.js           # Pool mysql2/promise
│   │   ├── cors.js
│   │   └── storage.js            # Selección de proveedor: local | s3 | cloudinary
│   │
│   ├── core/                     # Infraestructura transversal (sin lógica de negocio)
│   │   ├── errors/
│   │   │   ├── AppError.js       # Error base con statusCode + code
│   │   │   └── errorCodes.js
│   │   ├── middleware/
│   │   │   ├── authenticate.js   # Verifica JWT → req.user { id, schoolId, role }
│   │   │   ├── authorize.js      # authorize('TEACHER','ADMIN')
│   │   │   ├── tenantContext.js  # AsyncLocalStorage con schoolId del token
│   │   │   ├── validate.js       # Valida body/query/params con zod
│   │   │   ├── upload.js         # multer: límites de tamaño y MIME whitelist
│   │   │   ├── rateLimit.js
│   │   │   └── errorHandler.js   # Manejo centralizado + notFound
│   │   ├── db/
│   │   │   ├── BaseRepository.js # Inyecta school_id en TODA consulta
│   │   │   └── transaction.js    # withTransaction(async (conn) => ...)
│   │   └── utils/
│   │       ├── asyncHandler.js
│   │       ├── logger.js         # pino
│   │       ├── pagination.js     # cursor-based
│   │       └── dates.js          # Conversión UTC ↔ timezone del colegio
│   │
│   ├── modules/
│   │   ├── auth/                 # login, refresh, logout, me
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   ├── auth.repository.js
│   │   │   └── auth.schemas.js
│   │   ├── schools/              # Configuración del tenant (super-admin)
│   │   ├── users/                # Admin: alta de profesores, alumnos, padres
│   │   ├── academic/             # Ciclos, unidades, grados, secciones, cursos
│   │   │   └── unitVisibility.service.js   # Regla de visibilidad por unidad
│   │   ├── enrollments/
│   │   ├── gradebook/            # Notas estilo Excel
│   │   │   ├── gradebook.*.js
│   │   │   └── import/
│   │   │       ├── template.builder.js     # Genera .xlsx/.csv con códigos de alumno
│   │   │       ├── sheet.parser.js         # exceljs / csv-parse
│   │   │       └── row.validator.js        # Tipos, códigos, rangos
│   │   ├── activities/           # Tareas por curso (sección + materia)
│   │   ├── submissions/          # Entregas, reintentos y revisión
│   │   │   └── submission.stateMachine.js  # Transiciones válidas de estado
│   │   ├── notifications/        # Persistencia + emisión en tiempo real
│   │   ├── messages/             # Mensajes por asunto (tareas, ausencias) con permisos por rol
│   │   ├── feed/                 # Muro de Inicio: publica la administración; todos reaccionan y comentan
│   │   ├── meetings/             # Reuniones virtuales por clase, con código único por reunión
│   │   ├── calendar/             # Calendario general (eventos de la administración + reuniones + entregas)
│   │   ├── files/                # Metadatos de archivos y URLs firmadas
│   │   └── finance/              # Cargos, pagos, estados de cuenta
│   │
│   ├── realtime/
│   │   ├── socket.js             # Socket.io + auth por JWT en handshake
│   │   ├── rooms.js              # Convención de salas: school:{id}, user:{id}
│   │   └── emitter.js            # API interna: notifyUser(userId, payload)
│   │
│   ├── jobs/
│   │   ├── scheduler.js          # node-cron: registra todos los jobs
│   │   ├── jobLock.js            # Idempotencia vía tabla job_runs
│   │   ├── submissionReminders.job.js  # Vencidas + rechazadas (cíclico)
│   │   ├── unitActivation.job.js       # Activa la unidad según calendario
│   │   └── paymentReminders.job.js     # Próximos vencimientos y mora
│   │
│   └── storage/
│       ├── StorageProvider.js    # Interfaz: put, getSignedUrl, delete
│       ├── local.provider.js
│       └── s3.provider.js
│
├── tests/
│   ├── unit/
│   └── integration/              # Incluye pruebas de aislamiento entre tenants
├── uploads/                      # Solo con proveedor local (en .gitignore)
├── .env.example
└── package.json
```

**Responsabilidad de cada capa**

| Capa | Hace | No hace |
|---|---|---|
| `routes` | Declara ruta, middlewares (`authenticate`, `authorize`, `validate`) | Lógica |
| `controller` | Traduce HTTP ↔ servicio (lee `req`, responde `res`) | SQL, reglas de negocio |
| `service` | Reglas de negocio, transacciones, dispara notificaciones | Conocer `req`/`res` |
| `repository` | SQL parametrizado, siempre filtrado por `school_id` | Decisiones de negocio |

---

## 2. Frontend (React + Vite + Tailwind)

También **por feature**. Estado del servidor con **TanStack Query** (caché,
reintentos, invalidación) y estado global de cliente con **Zustand** (sesión,
notificaciones en vivo, UI). Así Zustand no se convierte en una copia de la API.

```
frontend/
├── index.html
├── vite.config.js
├── tailwind.config.js
└── src/
    ├── main.jsx
    ├── app/
    │   ├── App.jsx
    │   ├── router.jsx            # Rutas lazy por rol
    │   └── providers.jsx         # QueryClient, Socket, Toaster
    │
    ├── components/
    │   ├── ui/                   # Primitivos estilo Vercel/Linear
    │   │   ├── Button.jsx  Badge.jsx  Card.jsx  Input.jsx  Textarea.jsx
    │   │   ├── Dialog.jsx  Drawer.jsx  Dropdown.jsx  Tabs.jsx  Tooltip.jsx
    │   │   ├── Table.jsx  Skeleton.jsx  EmptyState.jsx  Avatar.jsx
    │   │   └── FileDropzone.jsx
    │   └── layout/
    │       ├── AppShell.jsx      # Sidebar + Topbar + <Outlet/>
    │       ├── Sidebar.jsx       # Navegación según rol
    │       ├── Topbar.jsx
    │       └── CommandMenu.jsx   # ⌘K
    │
    ├── features/
    │   ├── auth/
    │   │   ├── api.js  store.js  LoginPage.jsx  RequireRole.jsx
    │   ├── dashboard/            # Una vista por rol
    │   ├── academic/             # Unidades, secciones, cursos (admin)
    │   ├── gradebook/
    │   │   ├── components/
    │   │   │   ├── GradeGrid.jsx         # Tabla virtualizada tipo hoja de cálculo
    │   │   │   ├── GradeCell.jsx
    │   │   │   └── ImportDialog.jsx      # Previsualización de errores por fila
    │   │   ├── hooks/
    │   │   │   ├── useGridNavigation.js  # Flechas, Tab, Enter, F2, Esc
    │   │   │   ├── useClipboardGrid.js   # Copiar/pegar TSV multi-celda
    │   │   │   └── useDirtyCells.js      # Guardado por lotes (debounce)
    │   │   ├── api.js
    │   │   └── pages/GradebookPage.jsx
    │   ├── activities/
    │   ├── submissions/
    │   │   ├── components/
    │   │   │   ├── SubmissionList.jsx
    │   │   │   ├── SubmissionReviewPanel.jsx
    │   │   │   ├── StatusBadge.jsx
    │   │   │   └── AttemptTimeline.jsx
    │   │   └── pages/ReviewSubmissionsPage.jsx
    │   ├── notifications/
    │   │   ├── store.js                  # Zustand: items, unreadCount
    │   │   ├── useNotificationSocket.js
    │   │   └── NotificationCenter.jsx
    │   └── finance/
    │       ├── AccountStatementPage.jsx
    │       └── PaymentHistoryTable.jsx
    │
    ├── lib/
    │   ├── apiClient.js          # fetch/axios + refresh token automático
    │   ├── socket.js             # Cliente Socket.io singleton
    │   ├── queryClient.js
    │   ├── cn.js                 # clsx + tailwind-merge
    │   └── format.js             # Fechas, moneda (Intl)
    │
    ├── hooks/                    # Hooks genéricos (useDebounce, useHotkeys…)
    └── styles/index.css
```

---

## 3. Estrategia multi-tenant (`school_id`)

Modelo: **base de datos compartida, esquema compartido, columna discriminadora**.
Es el que mejor escala en costo para cientos de colegios pequeños/medianos.

Se aplica en **cuatro capas**, para que un error en una no filtre datos:

1. **Origen único del tenant: el JWT.** `school_id` viaja firmado en el token
   (`{ sub, sid, role, tv }`). Nunca se lee de `body`, `query` ni `params`.
   El login se resuelve por subdominio (`colegio-x.app.com`) o slug, porque el
   email es único **por colegio**, no global.

2. **Contexto de petición.** `tenantContext` guarda `schoolId` en
   `AsyncLocalStorage`; los jobs cron abren su propio contexto por colegio.

3. **Repositorio base obligatorio.** `BaseRepository` exige `schoolId` y lo
   agrega a cada `WHERE`, `INSERT` y `UPDATE`. Si falta, lanza error (falla
   cerrado, no abierto). Un registro de otro colegio responde **404**, nunca 403,
   para no revelar su existencia.

4. **Integridad en la base de datos.** Cada tabla tiene `UNIQUE (school_id, id)`
   y las FKs son **compuestas**: `(school_id, activity_id) → activities(school_id, id)`.
   Así MySQL **rechaza físicamente** que una entrega del colegio A apunte a una
   actividad del colegio B, incluso con un bug en la aplicación.

Además, todos los índices compuestos comienzan con `school_id` para que cada
consulta del tenant use rango de índice, y las pruebas de integración incluyen
casos de acceso cruzado entre colegios.

Evolución futura: si un colegio grande lo requiere, el mismo esquema permite
moverlo a una base dedicada (enrutando el pool por `school_id`) sin cambiar código
de negocio.

---

## 4. Decisiones clave del modelo de datos

**Curso = sección + materia + profesor** (`courses`). Es la unidad de asignación
("3ro B · Matemáticas"). Las actividades se cuelgan del curso, así la
visibilidad exclusiva por sección sale gratis: un alumno ve las actividades de
los cursos de la sección donde tiene inscripción activa.

**Una fila de entrega por alumno y actividad** (`submissions`), creada al
publicar la actividad (y al inscribir alumnos nuevos). Esto hace que "pendiente"
sea un dato y no una ausencia, y el cron es una sola consulta indexada.
Cada reenvío es un `submission_attempt` y cada decisión del profesor un
`submission_review` (historial completo).

**Máquina de estados de la entrega**

```
             publicar
                │
                ▼
          ┌──────────┐  alumno entrega   ┌───────────┐
          │ PENDING  │ ────────────────▶ │ SUBMITTED │
          └──────────┘                   └───────────┘
                                          │        │
                              aprueba     │        │ rechaza (comentario obligatorio)
                                          ▼        ▼
                                   ┌──────────┐ ┌──────────┐
                                   │ APPROVED │ │ REJECTED │
                                   └──────────┘ └──────────┘
                                                     │ alumno reenvía
                                                     └──────▶ SUBMITTED
```

**Recordatorios cíclicos con una sola columna: `next_reminder_at`.**

| Evento | `next_reminder_at` |
|---|---|
| Publicar actividad | `due_at` |
| Alumno entrega | `NULL` |
| Profesor rechaza | `NOW() + intervalo` (ej. 24 h) |
| Profesor aprueba | `NULL` |
| Cron envía recordatorio | `NOW() + intervalo`, `reminder_count + 1` |

El job diario solo hace:
`WHERE school_id = ? AND status IN ('PENDING','REJECTED') AND next_reminder_at <= NOW()`
(índice `ix_submissions_reminders`). Notifica al alumno y a sus encargados con
`dedupe_key` para no duplicar si el job se reintenta.

**Visibilidad por unidad académica.** `academic_units.status`:
`SCHEDULED` (futura, oculta a alumnos/padres) → `ACTIVE` → `CLOSED` (histórica,
solo lectura). Solo puede haber **una unidad activa por ciclo** (garantizado por
índice único sobre columna generada). El job `unitActivation` activa la siguiente
unidad cuando llega su `starts_on` **solo si la administración ya cerró la
anterior**; el cierre manual siempre manda.

**Finanzas.** `charges` (lo que se debe) y `payments` (lo que entra) se unen con
`payment_allocations`, lo que soporta pagos parciales y un pago que cubre varios
meses. El saldo es columna generada (`balance`), sin riesgo de desincronización.

**Tipos.** `DECIMAL` para notas y dinero (nunca `FLOAT`), `DATETIME` en UTC
(se convierte con `schools.timezone`), `ENUM` para estados de ciclo de vida y
`VARCHAR` para catálogos que crecen (tipos de notificación).
