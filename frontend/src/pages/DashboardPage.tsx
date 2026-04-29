import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Design-pattern note: Presentational / Container split is intentional.
// Sub-components below are pure presentational; DashboardPage is the container
// that owns data (auth user, navigation). This follows the Separation of
// Concerns principle and keeps each piece independently testable.
// ---------------------------------------------------------------------------

/**
 * Material Symbols icon wrapper.
 *
 * Uses the Google Material Symbols font already linked in index.html.
 *
 * @param {Object}  props
 * @param {string}  props.name      - Icon ligature name (e.g. "dashboard")
 * @param {boolean} [props.fill]    - Whether to render the filled variant
 * @param {string}  [props.className]
 */
function MaterialIcon({
  name,
  fill = false,
  className = '',
}: {
  name: string;
  fill?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined select-none ${className}`}
      style={{
        fontVariationSettings: fill
          ? "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24"
          : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
      }}
    >
      {name}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sidebar nav item shape
// ---------------------------------------------------------------------------
interface NavItem {
  /** Icon ligature */
  icon: string;
  /** Hebrew label */
  label: string;
  /** Whether this is the active route */
  isActive?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { icon: 'dashboard',       label: 'דאשבורד',        isActive: true },
  { icon: 'calendar_month',  label: 'סידור עבודה' },
  { icon: 'assignment_late', label: 'הגשת אילוצים' },
  { icon: 'rule_folder',     label: 'בקשות חופשה' },
  { icon: 'mail',            label: 'הודעות ומסרים' },
  { icon: 'person',          label: 'פרופיל אישי' },
];

// ---------------------------------------------------------------------------
// Weekly schedule rows
// ---------------------------------------------------------------------------
interface ScheduleRow {
  day: string;
  label: string;
  isToday?: boolean;
  isNext?: boolean;
  isDayOff?: boolean;
}

const WEEKLY_SCHEDULE: ScheduleRow[] = [
  { day: "היום (ב')", label: 'משמרת עברה', isToday: true },
  { day: "מחר (ג')",  label: '08:00 - 16:00', isNext: true },
  { day: 'רביעי',     label: '16:00 - 00:00' },
  { day: 'חמישי',     label: 'חופש', isDayOff: true },
];

// ---------------------------------------------------------------------------
// Quick-action buttons
// ---------------------------------------------------------------------------
interface QuickAction {
  icon: string;
  label: string;
  iconColorClass: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { icon: 'flight_takeoff',  label: 'בקשת חופשה',  iconColorClass: 'text-secondary' },
  { icon: 'medical_services',label: 'דיווח מחלה',  iconColorClass: 'text-error' },
  { icon: 'person_edit',     label: 'עדכון פרטים', iconColorClass: 'text-primary' },
  { icon: 'chat',            label: 'פנייה למנהל', iconColorClass: 'text-on-surface-variant' },
];

// ---------------------------------------------------------------------------
// SideNavBar – desktop only
// ---------------------------------------------------------------------------

/**
 * Enterprise sidebar navigation for desktop screens.
 *
 * Renders nav links, a primary CTA button, and a logout link.
 * Hidden on mobile (md:flex breakpoint).
 *
 * @param {Object}   props
 * @param {Function} props.onLogout - Callback invoked when user clicks Logout
 */
function SideNavBar({ onLogout }: { onLogout: () => void }) {
  return (
    <aside
      className="bg-slate-950 fixed right-0 top-0 h-screen w-64 border-l border-white/10 shadow-2xl flex-col hidden md:flex z-50"
      dir="rtl"
      aria-label="ניווט ראשי"
    >
      {/* Brand header */}
      <div className="p-lg border-b border-white/10 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
          B
        </div>
        <div>
          <h1 className="text-white text-lg font-black tracking-tight font-sans">בזק HML</h1>
          <p className="text-slate-400 text-xs">ניהול כוח אדם</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-lg overflow-y-auto space-y-1" aria-label="ניווט עיקרי">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.label}
            href="#"
            className={[
              'px-4 py-3 flex flex-row-reverse items-center gap-3 text-sm transition-all duration-200',
              item.isActive
                ? 'bg-blue-600/20 text-blue-400 border-r-4 border-blue-500 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/5 hover:translate-x-[-4px]',
            ].join(' ')}
            aria-current={item.isActive ? 'page' : undefined}
          >
            <MaterialIcon
              name={item.icon}
              fill={item.isActive}
              className="text-[22px]"
            />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      {/* Footer actions */}
      <div className="p-lg border-t border-white/10 space-y-3">
        {/* Primary CTA */}
        <button
          id="sidebar-submit-constraints-btn"
          className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg font-bold shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <MaterialIcon name="assignment_add" className="text-[20px]" />
          הגש אילוצים עכשיו
        </button>

        {/* Logout */}
        <button
          id="sidebar-logout-btn"
          onClick={onLogout}
          className="w-full text-error hover:text-red-400 px-4 py-3 flex flex-row-reverse items-center gap-3 text-sm hover:bg-white/5 transition-all duration-200 rounded-lg hover:translate-x-[-4px]"
        >
          <MaterialIcon name="logout" className="text-[22px]" />
          <span>התנתק</span>
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// TopAppBar – mobile only
// ---------------------------------------------------------------------------

/**
 * Sticky top app bar shown only on mobile screens.
 *
 * @param {Object}   props
 * @param {Function} props.onLogout
 */
function TopAppBar({ onLogout }: { onLogout: () => void }) {
  return (
    <header
      className="bg-white/90 backdrop-blur-md sticky top-0 border-b border-slate-200 shadow-sm z-40 flex flex-row-reverse justify-between items-center px-6 h-16 w-full md:hidden"
      dir="rtl"
    >
      <span className="text-xl font-black text-blue-900 font-sans">בזק HML</span>

      <div className="flex items-center gap-2 text-blue-700">
        <button
          id="topbar-notifications-btn"
          className="hover:bg-slate-50 transition-colors p-2 rounded-full"
          aria-label="התראות"
        >
          <MaterialIcon name="notifications" />
        </button>
        <button
          id="topbar-schedule-btn"
          className="hover:bg-slate-50 transition-colors p-2 rounded-full"
          aria-label="לוח זמנים"
        >
          <MaterialIcon name="schedule" />
        </button>
        <button
          id="topbar-logout-btn"
          onClick={onLogout}
          className="hover:bg-slate-50 transition-colors p-2 rounded-full"
          aria-label="הגדרות"
        >
          <MaterialIcon name="logout" />
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// HeroShiftCard – next shift spotlight
// ---------------------------------------------------------------------------

/**
 * Hero card displayed at the top of the dashboard, highlighting the next
 * scheduled shift with a gradient background and clock icon watermark.
 */
function HeroShiftCard() {
  return (
    <section
      className="bg-gradient-to-br from-primary-container to-blue-900 rounded-xl p-lg md:p-xl shadow-bezeq-float text-white relative overflow-hidden flex flex-col justify-center ring-4 ring-primary-fixed/20"
      style={{ minHeight: '160px' }}
      aria-label="משמרת הבאה"
    >
      {/* Watermark icon */}
      <div className="absolute -right-10 -top-10 opacity-10 pointer-events-none select-none">
        <MaterialIcon name="schedule" className="text-[150px]" />
      </div>

      <div className="relative z-10 flex justify-between items-center">
        <div>
          <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3 inline-block">
            משמרת הבאה
          </span>
          <h3 className="text-h2 font-bold mb-1">מחר, יום שלישי</h3>
          <div className="flex items-center gap-2 text-primary-fixed-dim">
            <MaterialIcon name="schedule" className="text-[20px]" />
            <span className="text-h3 font-semibold">08:00 - 16:00</span>
          </div>
        </div>

        <div className="hidden sm:block text-center">
          <p className="text-xs text-primary-fixed-dim mb-1">סוג משמרת</p>
          <p className="font-bold text-lg">משמרת בוקר</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ConstraintCountdownCard
// ---------------------------------------------------------------------------

/**
 * Card showing the countdown timer until the constraint submission deadline.
 *
 * Provides a direct CTA button to open the constraints form.
 */
function ConstraintCountdownCard() {
  return (
    <div
      className="bg-surface-container-lowest rounded-xl p-lg shadow-bezeq-card border border-surface-variant flex flex-col justify-between"
      aria-label="הגשת אילוצים"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="font-bold text-on-surface mb-1">הגשת אילוצים</h4>
          <p className="text-xs text-on-surface-variant">לשבוע 44</p>
        </div>
        <MaterialIcon name="assignment_late" className="text-secondary text-[24px]" />
      </div>

      {/* Countdown display */}
      <div className="text-center py-4 bg-error-container/30 rounded-lg border border-error-container mb-4">
        <p className="text-xs text-on-surface-variant mb-2">הזמן שנותר להגשה</p>
        <div className="text-error flex justify-center items-baseline gap-1" style={{ fontSize: '32px', lineHeight: 1, fontWeight: 700 }}>
          <span>2</span>
          <span className="text-lg font-semibold">ימים</span>
          <span className="mr-2">14</span>
          <span className="text-lg font-semibold">שעות</span>
        </div>
      </div>

      {/* CTA */}
      <button
        id="dashboard-submit-constraints-btn"
        className="w-full h-12 bg-secondary hover:bg-blue-700 text-white rounded-full font-bold transition-colors flex items-center justify-center gap-2"
      >
        <MaterialIcon name="edit_calendar" className="text-[18px]" />
        הגש אילוצים
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeeklyOverviewCard
// ---------------------------------------------------------------------------

/**
 * Renders a list of this week's schedule rows.
 * Today is styled as "past shift", next shift highlighted in primary brand colour,
 * and days-off shown in muted text.
 */
function WeeklyOverviewCard() {
  return (
    <div
      className="bg-surface-container-lowest rounded-xl p-lg shadow-bezeq-card border border-surface-variant flex flex-col"
      aria-label="סידור שבועי"
    >
      <h4 className="font-bold text-on-surface mb-4 flex items-center gap-2">
        <MaterialIcon name="calendar_month" className="text-outline text-[22px]" />
        השבוע שלי
      </h4>

      <div className="flex-1 space-y-2">
        {WEEKLY_SCHEDULE.map((row) => {
          if (row.isToday) {
            return (
              <div
                key={row.day}
                className="flex justify-between items-center p-3 bg-surface-container-low rounded-lg border border-transparent"
              >
                <span className="text-on-surface text-sm">{row.day}</span>
                <span className="text-on-surface-variant text-sm opacity-70">{row.label}</span>
              </div>
            );
          }
          if (row.isNext) {
            return (
              <div
                key={row.day}
                className="flex justify-between items-center p-3 bg-primary-container text-white rounded-lg border border-primary"
              >
                <span className="text-sm font-medium">{row.day}</span>
                <span className="text-sm font-bold">{row.label}</span>
              </div>
            );
          }
          return (
            <div
              key={row.day}
              className="flex justify-between items-center p-3 bg-surface-container-lowest rounded-lg border border-surface-variant hover:border-outline-variant transition-colors"
            >
              <span className="text-on-surface text-sm">{row.day}</span>
              <span className={`text-sm font-bold ${row.isDayOff ? 'text-on-surface-variant' : 'text-on-surface-variant'}`}>
                {row.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationsPanel
// ---------------------------------------------------------------------------

/**
 * Right-column notifications panel with unread badge and message list.
 */
function NotificationsPanel() {
  return (
    <section
      className="bg-surface-container-lowest rounded-xl p-lg shadow-bezeq-card border border-surface-variant"
      aria-label="הודעות מערכת"
    >
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-surface-variant">
        <h4 className="font-bold text-on-surface flex items-center gap-2">
          <MaterialIcon name="campaign" className="text-primary text-[22px]" />
          הודעות מערכת
        </h4>
        <span className="bg-error text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          2 חדשות
        </span>
      </div>

      <div className="space-y-4">
        {/* Unread message */}
        <div className="p-3 bg-blue-50 rounded-lg border-r-4 border-secondary">
          <p className="font-bold text-sm text-on-surface mb-1">עדכון נוהל משמרת ערב</p>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            החל מיום ראשון הקרוב, שעת תחילת משמרת ערב תעודכן ל-15:30.
          </p>
          <p className="text-[10px] text-outline mt-2">לפני שעתיים</p>
        </div>

        {/* Read message */}
        <div className="p-3 hover:bg-surface-container-low rounded-lg transition-colors border border-transparent">
          <p className="font-bold text-sm text-on-surface mb-1">אילוצים לשבוע 44</p>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            אנא זכרו להגיש אילוצים עד יום חמישי ב-12:00.
          </p>
          <p className="text-[10px] text-outline mt-2">אתמול</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// QuickActionsPanel
// ---------------------------------------------------------------------------

/**
 * 2×2 grid of quick-action shortcut buttons in the right column.
 */
function QuickActionsPanel() {
  return (
    <section
      className="bg-surface-container-low rounded-xl p-lg border border-outline-variant"
      aria-label="פעולות מהירות"
    >
      <h4 className="font-bold text-on-surface mb-4">פעולות ופניות</h4>

      <div className="grid grid-cols-2 gap-3">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            id={`quick-action-${action.icon}-btn`}
            className="bg-surface-container-lowest hover:bg-surface-variant border border-outline-variant rounded-lg p-3 flex flex-col items-center justify-center gap-2 transition-colors h-[90px]"
          >
            <MaterialIcon name={action.icon} className={`${action.iconColorClass} text-[26px]`} />
            <span className="text-xs font-bold text-center text-on-surface">{action.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// DashboardPage – container component
// ---------------------------------------------------------------------------

/**
 * Employee Dashboard Page.
 *
 * Layout:
 * ```
 * ┌──────────────────────┬──────────────────┐
 * │   SideNavBar (right) │  Mobile TopBar   │
 * ├──────────────────────┴──────────────────┤
 * │  Header greeting / week badge            │
 * ├───────────────────────────┬─────────────┤
 * │  HeroShiftCard            │ Notifications│
 * │  ConstraintCountdown      │ QuickActions │
 * │  WeeklyOverview           │             │
 * └───────────────────────────┴─────────────┘
 * ```
 *
 * @returns {React.ReactElement}
 */
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Redirect admin / manager users to the admin dashboard
  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'manager')) {
      navigate('/admin');
    }
  }, [user, navigate]);

  /**
   * Logs the current user out and redirects to the login screen.
   */
  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="bg-background text-on-background antialiased min-h-screen flex flex-col md:flex-row" dir="rtl">

      {/* ── Mobile top app bar ─────────────────────────────────────────── */}
      <TopAppBar onLogout={handleLogout} />

      {/* ── Desktop sidebar ────────────────────────────────────────────── */}
      <SideNavBar onLogout={handleLogout} />

      {/* ── Main canvas ────────────────────────────────────────────────── */}
      <main className="flex-1 md:pr-64 min-h-screen">
        <div className="max-w-[1200px] mx-auto p-lg md:p-xl space-y-xl">

          {/* ── Section header ─────────────────────────────────────────── */}
          <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-surface-variant pb-lg">
            <div>
              <h2 className="text-h2 text-on-surface mb-1">
                שלום, {user?.name || 'ישראל ישראלי'}
              </h2>
              <p className="text-sm text-on-surface-variant">
                {new Date().toLocaleDateString('he-IL', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>

            {/* Week badge */}
            <div className="bg-surface-container px-4 py-2 rounded-full border border-outline-variant flex items-center gap-2 text-on-surface-variant">
              <MaterialIcon name="calendar_view_week" className="text-[18px]" />
              <span className="text-sm font-bold">שבוע 43 (22.10 - 28.10)</span>
            </div>
          </section>

          {/* ── 12-column bento grid ───────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

            {/* Left / main column (8 of 12) */}
            <div className="lg:col-span-8 space-y-5">
              <HeroShiftCard />

              {/* Two-up bento row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <ConstraintCountdownCard />
                <WeeklyOverviewCard />
              </div>
            </div>

            {/* Right / secondary column (4 of 12) */}
            <div className="lg:col-span-4 space-y-5">
              <NotificationsPanel />
              <QuickActionsPanel />
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
