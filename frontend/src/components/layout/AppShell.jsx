import { NavLink, Outlet, useLocation } from 'react-router';
import { Award, Bell, BookOpen, ClipboardCheck, GraduationCap, LayoutDashboard, School, Table2, Users, Wallet } from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { useNotificationsLive } from '@/features/notifications/hooks';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { NotificationToasts } from '@/features/notifications/NotificationToasts';
import { useNotificationStore } from '@/features/notifications/store';
import { cn } from '@/lib/cn';
import { UserMenu } from './UserMenu';

const NOTIFICATIONS_PATH = '/notifications';

const staffNavigation = [
  { to: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { to: '/courses', label: 'Mis cursos', icon: BookOpen, end: true },
  { to: '/activities', label: 'Actividades', icon: ClipboardCheck },
  // La hoja de un curso vive en /courses/:id/gradebook
  { to: '/gradebook', label: 'Cuadro de notas', icon: Table2, alsoActive: (path) => path.endsWith('/gradebook') },
  { to: NOTIFICATIONS_PATH, label: 'Notificaciones', icon: Bell },
];

const NAVIGATION_BY_ROLE = {
  ADMIN: [
    ...staffNavigation.slice(0, -1),
    { to: '/admin/people', label: 'Personas', icon: Users },
    { to: '/admin/academic', label: 'Estructura académica', icon: School },
    { to: '/admin/finance', label: 'Finanzas', icon: Wallet },
    staffNavigation.at(-1),
  ],
  TEACHER: staffNavigation,
  STUDENT: [
    { to: '/my/activities', label: 'Mis tareas', icon: ClipboardCheck },
    { to: '/my/grades', label: 'Mis notas', icon: Award },
    { to: NOTIFICATIONS_PATH, label: 'Notificaciones', icon: Bell },
  ],
  PARENT: [
    { to: '/my/activities', label: 'Tareas', icon: ClipboardCheck },
    { to: '/my/grades', label: 'Notas', icon: Award },
    { to: '/finance', label: 'Pagos', icon: Wallet },
    { to: NOTIFICATIONS_PATH, label: 'Notificaciones', icon: Bell },
  ],
};

function SchoolBadge({ name }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-white">
        <GraduationCap className="size-4" />
      </span>
      <p className="truncate text-sm font-semibold">{name}</p>
    </div>
  );
}

export function AppShell() {
  const schoolName = useAuthStore((state) => state.user?.school.name);
  const role = useAuthStore((state) => state.user?.role);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const { pathname } = useLocation();
  useNotificationsLive();

  const navigation = NAVIGATION_BY_ROLE[role] ?? [];
  const isActive = ({ to, end, alsoActive }) =>
    (end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)) || Boolean(alsoActive?.(pathname));

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-200 bg-white md:flex">
        <div className="flex h-14 items-center justify-between gap-2 border-b border-zinc-200 pr-2 pl-4">
          <SchoolBadge name={schoolName} />
          <NotificationBell align="left" />
        </div>

        <nav className="flex-1 space-y-0.5 p-2">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900',
                isActive(item) && 'bg-zinc-100 font-medium text-zinc-900',
              )}
            >
              <item.icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {item.to === NOTIFICATIONS_PATH && unreadCount > 0 && (
                <span className="rounded-full bg-zinc-200 px-1.5 text-[11px] font-medium text-zinc-700 tabular-nums">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <UserMenu />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {/* En celular la barra lateral se vuelve una barra superior con íconos; la campana reemplaza al enlace */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-4 md:hidden">
          <SchoolBadge name={schoolName} />
          <nav className="ml-auto flex items-center gap-0.5">
            {navigation
              .filter((item) => item.to !== NOTIFICATIONS_PATH)
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900',
                    isActive(item) && 'bg-zinc-100 text-zinc-900',
                  )}
                >
                  <item.icon className="size-4" />
                </NavLink>
              ))}
            <NotificationBell align="right" />
          </nav>
          <UserMenu compact />
        </div>
        <Outlet />
      </main>

      <NotificationToasts />
    </div>
  );
}
