import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, KeyRound, Pencil, Plus, Search, UserCheck, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuthStore } from '@/features/auth/store';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { adminApi } from '../api';
import { NewStudentDialog, StudentDetailDialog } from '../components/StudentDialog';
import { TemporaryPasswordDialog } from '../components/TemporaryPasswordDialog';
import { UserDialog } from '../components/UserDialog';
import { useAdminMutation, useAdminStudents, useAdminUsers } from '../hooks';

const TABS = [
  { value: 'STUDENT', label: 'Estudiantes', create: 'Nuevo estudiante' },
  { value: 'TEACHER', label: 'Docentes', create: 'Nuevo docente' },
  { value: 'PARENT', label: 'Familias', create: 'Nueva familia' },
  { value: 'ADMIN', label: 'Administración', create: 'Nuevo administrador' },
];

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const th = 'px-3 py-2 text-left text-xs font-medium text-zinc-500';
const td = 'px-3 py-2.5';

function UsersTable({ role, q, onEdit, onPassword }) {
  const myId = useAuthStore((state) => state.user?.id);
  const { data: users, isLoading, isError, error } = useAdminUsers({ role, q: q || undefined });
  const toggle = useAdminMutation(({ id, status }) => adminApi.updateUser(id, { status }));
  const reset = useAdminMutation(adminApi.resetPassword);
  const [confirm, setConfirm] = useState(null);

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (isError) return <p className="text-sm text-red-600">{error.message}</p>;

  return (
    <>
      {(toggle.error || reset.error) && <p className="mb-2 text-sm text-red-600">{(toggle.error ?? reset.error).message}</p>}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-xs">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50">
            <tr>
              <th className={th}>Nombre</th>
              <th className={cn(th, 'hidden md:table-cell')}>{role === 'TEACHER' ? 'Cursos' : role === 'PARENT' ? 'Estudiantes' : 'Teléfono'}</th>
              <th className={cn(th, 'hidden sm:table-cell')}>Último acceso</th>
              <th className={th}>Estado</th>
              <th className="w-px px-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  No hay usuarios.
                </td>
              </tr>
            )}
            {users.map((user) => {
              const disabled = user.status === 'DISABLED';
              return (
                <tr key={user.id} className={cn(disabled && 'text-zinc-400')}>
                  <td className={td}>
                    <span className="block font-medium">
                      {user.lastName}, {user.firstName}
                    </span>
                    <span className="block text-xs text-zinc-500">{user.email}</span>
                  </td>
                  <td className={cn(td, 'hidden text-zinc-600 md:table-cell')}>
                    {role === 'TEACHER' && user.courseCount}
                    {role === 'PARENT' && (user.children.length ? user.children.map((c) => c.name).join(', ') : <span className="text-amber-700">Sin vincular</span>)}
                    {role === 'ADMIN' && (user.phone ?? '—')}
                  </td>
                  <td className={cn(td, 'hidden text-zinc-500 sm:table-cell')}>{user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Nunca'}</td>
                  <td className={td}>
                    <Badge tone={disabled ? 'red' : 'green'}>{disabled ? 'Deshabilitado' : 'Activo'}</Badge>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end gap-0.5">
                      <Button size="icon" variant="ghost" onClick={() => onEdit(user)} aria-label="Editar" title="Editar">
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Restablecer contraseña"
                        aria-label="Restablecer contraseña"
                        onClick={async () => {
                          try {
                            const result = await reset.mutateAsync(user.id);
                            onPassword({ name: user.firstName, email: user.email, password: result.temporaryPassword });
                          } catch {
                            // se muestra arriba
                          }
                        }}
                      >
                        <KeyRound className="size-4" />
                      </Button>
                      {user.id !== myId && (
                        <Button
                          size="sm"
                          variant={confirm === user.id ? 'warning' : 'ghost'}
                          title={disabled ? 'Activar' : 'Deshabilitar'}
                          onClick={() => {
                            if (!disabled && confirm !== user.id) return setConfirm(user.id);
                            toggle.mutate({ id: user.id, status: disabled ? 'ACTIVE' : 'DISABLED' }, { onSettled: () => setConfirm(null) });
                          }}
                        >
                          {disabled ? <UserCheck className="size-4" /> : <UserX className="size-4" />}
                          {confirm === user.id && '¿Deshabilitar?'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StudentsTable({ q, onOpen }) {
  const { data: students, isLoading, isError, error } = useAdminStudents({ q: q || undefined });

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;
  if (isError) return <p className="text-sm text-red-600">{error.message}</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-xs">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50">
          <tr>
            <th className={th}>Estudiante</th>
            <th className={th}>Sección</th>
            <th className={cn(th, 'hidden md:table-cell')}>Cuenta</th>
            <th className={cn(th, 'hidden sm:table-cell')}>Familia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {students.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-zinc-500">
                No hay estudiantes.
              </td>
            </tr>
          )}
          {students.map((student) => {
            const enrolled = student.enrollment?.status === 'ACTIVE';
            return (
              <tr key={student.id} className="relative cursor-pointer hover:bg-zinc-50" onClick={() => onOpen(student.id)}>
                <td className={td}>
                  <button type="button" className="text-left font-medium after:absolute after:inset-0" onClick={() => onOpen(student.id)}>
                    {student.lastName}, {student.firstName}
                  </button>
                  <span className="block font-mono text-xs text-zinc-500">{student.code}</span>
                </td>
                <td className={td}>
                  {enrolled ? student.enrollment.section : <Badge tone={student.enrollment ? 'amber' : 'neutral'}>{student.enrollment ? 'Retirado' : 'Sin inscribir'}</Badge>}
                </td>
                <td className={cn(td, 'hidden text-zinc-600 md:table-cell')}>{student.account?.email ?? <span className="text-zinc-400">Sin cuenta</span>}</td>
                <td className={cn(td, 'hidden text-zinc-600 sm:table-cell')}>
                  {student.guardians.length ? student.guardians.map((g) => g.name).join(', ') : <span className="text-amber-700">Sin familia</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Personas del colegio: estudiantes, docentes, familias y administración. */
export function PeoplePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.find((item) => item.value === searchParams.get('tab')) ?? TABS[0];
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [dialog, setDialog] = useState(null); // { kind, user? }
  const [openStudentId, setOpenStudentId] = useState(null);
  const [password, setPassword] = useState(null);
  const { data: students = [] } = useAdminStudents({ q: q || undefined });
  const openStudent = students.find((student) => student.id === openStudentId);

  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-normal text-zinc-900">Personas</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Cuentas, inscripciones y vínculos familiares del colegio.</p>
        </div>
        <Button variant="primary" onClick={() => setDialog({ kind: tab.value === 'STUDENT' ? 'student' : 'user' })}>
          <Plus className="size-3.5" /> {tab.create}
        </Button>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Tipo" className="flex flex-wrap gap-1.5">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={item.value === tab.value}
              onClick={() => setSearchParams({ tab: item.value })}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                item.value === tab.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="relative ml-auto block w-full max-w-xs">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, correo o código"
            className="h-8 w-full rounded-md border border-zinc-200 bg-white pr-3 pl-8 text-sm shadow-xs focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200 focus:outline-none"
          />
        </label>
      </div>

      <div className="mt-3">
        {tab.value === 'STUDENT' ? (
          <StudentsTable q={q} onOpen={setOpenStudentId} />
        ) : (
          <UsersTable role={tab.value} q={q} onEdit={(user) => setDialog({ kind: 'user', user })} onPassword={setPassword} />
        )}
      </div>

      {tab.value === 'PARENT' && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
          <AlertTriangle className="size-3.5" /> Para vincular una familia con sus hijos, abre al estudiante en la pestaña Estudiantes.
        </p>
      )}

      {dialog?.kind === 'user' && (
        <UserDialog
          user={dialog.user ?? null}
          role={tab.value}
          onClose={() => setDialog(null)}
          onCreated={({ user, temporaryPassword }) => {
            setDialog(null);
            setPassword({ name: user.firstName, email: user.email, password: temporaryPassword });
          }}
        />
      )}
      {dialog?.kind === 'student' && (
        <NewStudentDialog
          onClose={() => setDialog(null)}
          onCreated={({ student, temporaryPassword }) => {
            setDialog(null);
            setOpenStudentId(student.id);
            if (temporaryPassword) setPassword({ name: student.firstName, email: student.account.email, password: temporaryPassword });
          }}
        />
      )}
      {openStudent && <StudentDetailDialog key={openStudent.id} student={openStudent} onClose={() => setOpenStudentId(null)} onPassword={setPassword} />}
      {password && <TemporaryPasswordDialog {...password} onClose={() => setPassword(null)} />}
    </div>
  );
}
