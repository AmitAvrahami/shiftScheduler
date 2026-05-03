import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import LogoutConfirmDialog from '../LogoutConfirmDialog';
import MaterialIcon from '../MaterialIcon';

interface NavItem {
  icon: string;
  label: string;
  path: string;
  requiredRole?: 'manager' | 'admin';
}

const EMPLOYEE_NAV_ITEMS: NavItem[] = [
  { icon: 'dashboard', label: 'לוח בקרה', path: '/dashboard' },
  { icon: 'calendar_today', label: 'משמרות שלי', path: '/my-shifts' },
  { icon: 'event_busy', label: 'הגשת אילוצים', path: '/constraints' },
  { icon: 'history', label: 'היסטוריית בקשות', path: '/history' },
];

const MANAGER_NAV_ITEMS: NavItem[] = [
  { icon: 'dashboard', label: 'דאשבורד', path: '/admin' },
  { icon: 'group', label: 'עובדים', path: '/users' },
  { icon: 'event_busy', label: 'אילוצי עובדים', path: '/admin/constraints' },
  { icon: 'calendar_month', label: 'לוחות זמנים', path: '/schedules' },
  { icon: 'analytics', label: 'דוחות', path: '/reports' },
];

interface MainLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function MainLayout({ children, title, subtitle, actions }: MainLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const navItems = user?.role === 'manager' || user?.role === 'admin' ? MANAGER_NAV_ITEMS : EMPLOYEE_NAV_ITEMS;

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="bg-background text-on-surface font-sans antialiased min-h-screen flex flex-col md:flex-row" dir="rtl">
      {/* SideNavBar - Desktop */}
      <nav className="flex flex-col h-[calc(100%-4rem)] w-64 fixed right-0 top-16 z-50 rtl bg-[#101B79] dark:bg-slate-950 border-l border-white/10 shadow-2xl hidden md:flex font-['Plus_Jakarta_Sans']">
        <div className="p-lg border-b border-white/10 flex items-center gap-md">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center overflow-hidden shrink-0">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              <div className="text-white font-black text-xl">
                {user?.name?.charAt(0) || 'B'}
              </div>
            )}
          </div>
          <div>
            <div className="text-2xl font-black text-white">בזק HML</div>
            <div className="text-[10px] text-white/70 uppercase tracking-wider font-bold">ניהול כוח אדם</div>
          </div>
        </div>

        <div className="p-md">
          <Link
            to="/constraints"
            className="w-full bg-[#056AE5] hover:bg-blue-600 text-white font-bold py-sm px-md rounded-lg flex items-center justify-center gap-xs transition-colors shadow-sm text-sm"
          >
            <MaterialIcon name="add" fill />
            הגשת אילוץ חדש
          </Link>
        </div>

        <div className="flex-1 py-md flex flex-col gap-xs px-sm">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-md px-md py-sm transition-all rounded-lg ${
                  isActive
                    ? 'bg-white/10 text-white font-bold scale-100'
                    : 'text-white/70 hover:bg-white/5 hover:text-white hover:scale-[0.98]'
                } active:scale-95 duration-200`}
              >
                <MaterialIcon name={item.icon} fill={isActive} />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="p-sm border-t border-white/10 flex flex-col gap-xs">
          <Link
            to="/settings"
            className="flex items-center gap-md px-md py-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors rounded-lg"
          >
            <MaterialIcon name="settings" />
            <span className="text-sm font-bold">הגדרות</span>
          </Link>
          <button
            onClick={() => setShowLogoutDialog(true)}
            className="flex items-center gap-md px-md py-sm text-error/90 hover:bg-error/10 hover:text-error transition-colors rounded-lg w-full text-right"
          >
            <MaterialIcon name="logout" />
            <span className="text-sm font-bold">התנתק</span>
          </button>
        </div>
      </nav>

      {/* TopAppBar - Mobile & Header Info */}
      <header className="flex items-center justify-between px-8 w-full z-[60] rtl fixed top-0 right-0 left-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm font-['Plus_Jakarta_Sans'] font-semibold">
        <div className="flex items-center gap-md">
          <h1 className="text-lg font-bold text-[#101B79] dark:text-white">{title}</h1>
          {subtitle && (
            <span className="bg-surface-variant text-on-surface-variant text-[10px] px-sm py-[2px] rounded-full">
              {subtitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-sm">
          {actions}
          <button className="w-10 h-10 rounded-full hover:bg-surface-variant flex items-center justify-center text-slate-500 hover:text-[#056AE5] transition-colors">
            <MaterialIcon name="notifications" />
          </button>
          <button className="w-10 h-10 rounded-full hover:bg-surface-variant flex items-center justify-center text-slate-500 hover:text-[#056AE5] transition-colors md:hidden" onClick={() => setShowLogoutDialog(true)}>
             <MaterialIcon name="logout" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full md:mr-64 pt-24 pb-xl px-4 md:px-xl min-h-screen">
        <div className="max-w-[1200px] mx-auto">
          {children}
        </div>
      </main>

      <LogoutConfirmDialog
        open={showLogoutDialog}
        onCancel={() => setShowLogoutDialog(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
}
