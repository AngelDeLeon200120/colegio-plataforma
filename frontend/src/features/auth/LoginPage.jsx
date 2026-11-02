import { useId, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { AlertCircle, Eye, EyeOff, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { authApi } from './api';
import { FullScreenLoader, useSessionBootstrap } from './RequireAuth';
import { useAuthStore } from './store';

const LAST_SCHOOL_KEY = 'last-school-slug';

// En producción cada colegio entra por su subdominio: demo.plataforma.edu → "demo"
function schoolFromHostname() {
  const { hostname } = window.location;
  if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) return null; // IPv4 / IPv6
  const parts = hostname.split('.');
  return parts.length >= 3 && parts[0] !== 'www' ? parts[0] : null;
}

function readLastSchool() {
  try {
    return localStorage.getItem(LAST_SCHOOL_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberSchool(slug) {
  try {
    localStorage.setItem(LAST_SCHOOL_KEY, slug);
  } catch {
    // Solo es una comodidad
  }
}

const inputClass =
  'h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm shadow-xs placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none aria-invalid:border-red-300 aria-invalid:ring-2 aria-invalid:ring-red-100';

function Field({ id, label, error, children }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-700">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function LoginPage() {
  const status = useSessionBootstrap();
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((state) => state.setSession);

  const hostSchool = schoolFromHostname();
  const [schoolSlug, setSchoolSlug] = useState(() => hostSchool ?? readLastSchool());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const ids = { school: useId(), email: useId(), password: useId() };

  const redirectTo = location.state?.from?.pathname ?? '/';

  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'authenticated') return <Navigate to={redirectTo} replace />;

  const fieldError = (field) => error?.details?.find((detail) => detail.field === field)?.issue;

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const session = await authApi.login({ schoolSlug, email, password });
      if (!hostSchool) rememberSchool(schoolSlug.trim().toLowerCase());
      setSession(session);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  const generalError = error && !error.details?.length ? error.message : null;

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-brand-600 text-white">
            <GraduationCap className="size-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-zinc-900">Inicia sesión</h1>
          <p className="mt-1 text-sm text-zinc-500">Accede a tu plataforma escolar</p>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          {generalError && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-100">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {generalError}
            </p>
          )}

          {!hostSchool && (
            <Field id={ids.school} label="Código del colegio" error={fieldError('schoolSlug')}>
              <input
                id={ids.school}
                value={schoolSlug}
                onChange={(event) => setSchoolSlug(event.target.value)}
                placeholder="ej. demo"
                autoComplete="organization"
                autoCapitalize="none"
                spellCheck={false}
                required
                aria-invalid={Boolean(fieldError('schoolSlug'))}
                className={inputClass}
              />
            </Field>
          )}

          <Field id={ids.email} label="Correo electrónico" error={fieldError('email')}>
            <input
              id={ids.email}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nombre@colegio.edu"
              autoComplete="username"
              autoFocus={Boolean(schoolSlug)}
              required
              aria-invalid={Boolean(fieldError('email'))}
              className={inputClass}
            />
          </Field>

          <Field id={ids.password} label="Contraseña" error={fieldError('password')}>
            <div className="relative">
              <input
                id={ids.password}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                aria-invalid={Boolean(fieldError('password'))}
                className={cn(inputClass, 'pr-10')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-zinc-400 hover:text-zinc-600"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>

          <Button type="submit" variant="primary" className="h-9 w-full" loading={submitting}>
            Entrar
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-500">
          ¿Olvidaste tu contraseña? Pide a la administración de tu colegio que la restablezca.
        </p>
      </div>
    </div>
  );
}
