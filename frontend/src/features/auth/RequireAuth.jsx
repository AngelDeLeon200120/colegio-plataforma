import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Loader2, ShieldAlert } from 'lucide-react';
import { refreshSession } from './session';
import { useAuthStore } from './store';

/** Al abrir la app intenta recuperar la sesión con la cookie de refresh. */
export function useSessionBootstrap() {
  const status = useAuthStore((state) => state.status);
  useEffect(() => {
    if (status === 'loading') refreshSession();
  }, [status]);
  return status;
}

export function FullScreenLoader() {
  return (
    <div className="flex h-full items-center justify-center" role="status" aria-label="Cargando sesión">
      <Loader2 className="size-5 animate-spin text-zinc-400" />
    </div>
  );
}

/**
 * Protege rutas: sin sesión redirige al login recordando a dónde iba;
 * con `roles`, muestra un aviso si el rol no tiene acceso.
 */
export function RequireAuth({ roles }) {
  const status = useSessionBootstrap();
  const role = useAuthStore((state) => state.user?.role);
  const location = useLocation();

  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;

  if (roles && !roles.includes(role)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <ShieldAlert className="size-8 text-zinc-300" />
        <p className="text-sm font-medium text-zinc-900">No tienes acceso a esta sección</p>
        <p className="text-sm text-zinc-500">Si crees que es un error, contacta a la administración del colegio.</p>
      </div>
    );
  }

  return <Outlet />;
}
