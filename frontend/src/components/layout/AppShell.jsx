import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import {
  Award,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Home,
  LayoutDashboard,
  Menu,
  MessageSquare,
  School,
  Table2,
  Users,
  Video,
  Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/store';
import { useMessagesLive, useUnreadMessages } from '@/features/messages/hooks';
import { useNotificationsLive } from '@/features/notifications/hooks';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { NotificationToasts } from '@/features/notifications/NotificationToasts';
import { useNotificationStore } from '@/features/notifications/store';
import { cn } from '@/lib/cn';
import { UserMenu } from './UserMenu';

const NOTIFICATIONS_PATH = '/notifications';
const MESSAGES_PATH = '/messages';
const messagesItem = { to: MESSAGES_PATH, label: 'Mensajes', icon: MessageSquare };
const homeItem = { to: '/home', label: 'Inicio', icon: Home };
const meetingsItem = { to: '/meetings', label: 'Reuniones', icon: Video };
const calendarItem = { to: '/calendar', label: 'Calendario', icon: CalendarDays };

const staffNavigation = [
  homeItem,
  { to: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
  // La página de un curso vive en /courses/:id (su hoja de notas, en /courses/:id/gradebook)
  { to: '/courses', label: 'Mis cursos', icon: BookOpen, end: true, alsoActive: (path) => /^\/courses\/\d+\/?$/.test(path) },
  { to: '/activities', label: 'Actividades', icon: ClipboardCheck },
  // La hoja de un curso vive en /courses/:id/gradebook
  { to: '/gradebook', label: 'Cuadro de notas', icon: Table2, alsoActive: (path) => path.endsWith('/gradebook') },
  meetingsItem,
  calendarItem,
  messagesItem,
  { to: NOTIFICATIONS_PATH, label: 'Notificaciones', icon: Bell },
];

const NAVIGATION_BY_ROLE = {
  ADMIN: [
    ...staffNavigation.slice(0, -2),
    { to: '/admin/people', label: 'Personas', icon: Users },
    { to: '/admin/academic', label: 'Estructura académica', icon: School },
    { to: '/admin/finance', label: 'Finanzas', icon: Wallet },
    ...staffNavigation.slice(-2),
  ],
  TEACHER: staffNavigation,
  STUDENT: [
    homeItem,
    { to: '/my/activities', label: 'Mis tareas', icon: ClipboardCheck },
    { to: '/my/grades', label: 'Mis notas', icon: Award },
    meetingsItem,
    calendarItem,
    messagesItem,
    { to: NOTIFICATIONS_PATH, label: 'Notificaciones', icon: Bell },
  ],
  PARENT: [
    homeItem,
    { to: '/my/activities', label: 'Tareas', icon: ClipboardCheck },
    { to: '/my/grades', label: 'Notas', icon: Award },
    { to: '/finance', label: 'Pagos', icon: Wallet },
    meetingsItem,
    calendarItem,
    messagesItem,
    { to: NOTIFICATIONS_PATH, label: 'Notificaciones', icon: Bell },
  ],
};

function SchoolBadge({ name }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
        <GraduationCap className="size-[18px]" />
      </span>
      <p className="truncate text-[22px] leading-none text-zinc-700">{name}</p>
    </div>
  );
}

export function AppShell() {
  const schoolName = useAuthStore((state) => state.user?.school.name);
  const role = useAuthStore((state) => state.user?.role);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const { pathname } = useLocation();
  // Escritorio: menú expandido o reducido a íconos. Celular: menú superpuesto.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useNotificationsLive();
  useMessagesLive();
  const { data: unreadMessages = 0 } = useUnreadMessages();
  const badges = { [NOTIFICATIONS_PATH]: unreadCount, [MESSAGES_PATH]: unreadMessages };

  useEffect(() => setMobileOpen(false), [pathname]);

  const navigation = NAVIGATION_BY_ROLE[role] ?? [];
  const isActive = ({ to, end, alsoActive }) =>
    (end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)) || Boolean(alsoActive?.(pathname));

  const toggleMenu = () => (window.matchMedia('(min-width: 768px)').matches ? setCollapsed((value) => !value) : setMobileOpen((value) => !value));

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-zinc-300 bg-white px-2 sm:px-4">
        <button
          type="button"
          onClick={toggleMenu}
          aria-label="Menú principal"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100"
        >
          <Menu className="size-5" />
        </button>
        <SchoolBadge name={schoolName} />
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell align="right" />
          <UserMenu compact />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {mobileOpen && <div className="fixed inset-0 top-16 z-30 bg-zinc-900/30 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

        <aside
          className={cn(
            'z-40 shrink-0 overflow-y-auto border-r border-zinc-300 bg-white transition-[width,transform] duration-200',
            'fixed top-16 bottom-0 left-0 w-72 md:static md:translate-x-0',
            mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full',
            collapsed ? 'md:w-[72px]' : 'md:w-72',
          )}
        >
          <nav className="space-y-0.5 py-2 pr-3">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex h-12 items-center gap-5 rounded-r-full pr-4 pl-6 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100',
                  isActive(item) && 'bg-brand-50 text-brand-700 hover:bg-brand-100',
                )}
              >
                <span className="relative shrink-0">
                  <item.icon className="size-5" />
                  {collapsed && badges[item.to] > 0 && (
                    <span className="absolute -top-1 -right-1 size-2 rounded-full bg-red-500 max-md:hidden" />
                  )}
                </span>
                <span className={cn('flex-1 truncate', collapsed && 'md:hidden')}>{item.label}</span>
                {badges[item.to] > 0 && (
                  <span className={cn('rounded-full bg-brand-600 px-2 text-[11px] font-medium text-white tabular-nums', collapsed && 'md:hidden')}>
                    {badges[item.to]}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>

      <NotificationToasts />
    </div>
  );
}
