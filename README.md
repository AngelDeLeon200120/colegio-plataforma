# Plataforma SaaS para colegios

| Carpeta | Contenido |
|---|---|
| `docs/` | [Arquitectura](docs/01-arquitectura.md) · [API y WebSockets](docs/02-api.md) |
| `database/` | `schema.sql` (MySQL 8.0.16+) y `seeds/dev-seed.sql` |
| `backend/` | API Express 5 + Socket.io |
| `frontend/` | React 19 + Vite + Tailwind CSS v4 |

## Requisitos

- **Node.js 20 o superior** (recomendado 22 LTS). Tailwind v4 no funciona en Node 18.
- MySQL 8.0.16+

Con nvm-windows:

```bash
nvm install 22
nvm use 22
```

## 1. Base de datos

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p < database/seeds/dev-seed.sql
```

Si tu base es anterior a la sección de Mensajes, aplica solo la migración:

```bash
mysql -u root -p colegio_saas < database/migrations/001_mensajes.sql
```

Para desarrollo crea un usuario propio en lugar de usar `root`:

```sql
CREATE USER 'colegio_app'@'localhost' IDENTIFIED BY 'cambia-esto';
GRANT SELECT, INSERT, UPDATE, DELETE ON colegio_saas.* TO 'colegio_app'@'localhost';
```

## 2. Backend

```bash
cd backend
cp .env.example .env    # completa DB_* y JWT_ACCESS_SECRET
npm install
npm run dev             # http://localhost:4000/api/v1/health
```

Utilidades:

```bash
npm run hash -- "<contraseña>"       # hash scrypt para seeds o altas manuales
npm run token -- 2 1 TEACHER         # access token de prueba para curl (solo desarrollo)
```

## 3. Frontend

```bash
cd frontend
npm install
npm run dev          # contra el backend en :4000
npm run dev:mocks    # sin backend, con datos de ejemplo
```

Abre http://localhost:5173 e inicia sesión con el colegio `demo`. Los usuarios y la contraseña
de desarrollo están en `database/seeds/dev-seed.sql` (la profesora es `lucia@demo.edu`).
En modo mocks cualquier contraseña sirve para `lucia@demo.edu`, `admin@demo.edu` o `ana@demo.edu`.

## Sesiones

- **Access token** JWT de 15 min, solo en memoria del navegador.
- **Refresh token** opaco de 30 días en cookie `httpOnly`, `SameSite=Strict`, limitada a `/api/v1/auth`.
  Se rota en cada uso; reutilizar uno ya rotado cierra esa sesión (posible robo).
- **Cerrar en todos los dispositivos** revoca los refresh tokens e invalida los access tokens
  vigentes en menos de 30 s (caché de `sessionGuard`).
- Deshabilitar un usuario lo saca de la plataforma con el mismo mecanismo.
