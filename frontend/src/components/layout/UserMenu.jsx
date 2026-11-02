import { useEffect, useRef, useState } from 'react';
import { ChevronsUpDown, KeyRound, LogOut, MonitorX } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog';
import { useLogout } from '@/features/auth/useLogout';
import { useAuthStore } from '@/features/auth/store';
import { cn } from '@/lib/cn';

const ROLE_LABELS = {
  ADMIN: 'Administración',
  TEACHER: 'Docente',
  STUDENT: 'Estudiante',
  PARENT: 'Familia',
};

/** `compact`: solo avatar, el menú se abre hacia abajo (barra superior en móvil). */
export function UserMenu({ compact = false }) {
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const signOut = async (everywhere) => {
    setPending(true);
    await logout({ everywhere });
  };

  const itemClass =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50';

  return (
    <div ref={containerRef} className={cn('relative', !compact && 'border-t border-zinc-200 p-2')}>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-20 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg',
            compact ? 'top-full right-0 mt-2 w-64' : 'right-2 bottom-full left-2 mb-1',
          )}
        >
          <p className="truncate px-2 py-1.5 text-xs text-zinc-500">{user.email}</p>
          <div className="my-1 h-px bg-zinc-100" />
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              setChangingPassword(true);
            }}
          >
            <KeyRound className="size-4 text-zinc-400" />
            Cambiar contraseña
          </button>
          <button type="button" role="menuitem" className={itemClass} disabled={pending} onClick={() => signOut(false)}>
            <LogOut className="size-4 text-zinc-400" />
            Cerrar sesión
          </button>
          <button type="button" role="menuitem" className={itemClass} disabled={pending} onClick={() => signOut(true)}>
            <MonitorX className="size-4 text-zinc-400" />
            Cerrar en todos los dispositivos
          </button>
        </div>
      )}

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact ? `Menú de ${user.firstName} ${user.lastName}` : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex items-center gap-2.5 rounded-md text-left transition-colors hover:bg-zinc-100',
          compact ? 'p-0.5' : 'w-full p-1.5',
          open && 'bg-zinc-100',
        )}
      >
        <Avatar firstName={user.firstName} lastName={user.lastName} size="sm" />
        <span className={cn('min-w-0 flex-1 leading-tight', compact && 'hidden')}>
          <span className="block truncate text-sm font-medium text-zinc-900">
            {user.firstName} {user.lastName}
          </span>
          <span className="block text-xs text-zinc-500">{ROLE_LABELS[user.role]}</span>
        </span>
        {!compact && <ChevronsUpDown className="size-4 text-zinc-400" />}
      </button>
      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
    </div>
  );
}
