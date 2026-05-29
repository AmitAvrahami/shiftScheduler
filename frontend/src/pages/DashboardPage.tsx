import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Link, useNavigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import { WeekLabel } from '../components/WeekLabel';
import { PageDataBoundary } from '../components/ui/PageDataBoundary';
import {
  useEmployeeDashboardData,
  type EmployeeDashboardData,
  type EmployeeDashboardDay,
  type EmployeeDashboardShift,
} from '../hooks/useEmployeeDashboardData';
import { getCurrentWeekId } from '../utils/weekUtils';

/**
 * Hero card displayed at the top of the dashboard, highlighting the next
 * scheduled shift with a gradient background and clock icon watermark.
 */
function HeroShiftCard({ shift }: { shift: EmployeeDashboardShift | null }) {
  const dateLabel = shift
    ? new Date(shift.startsAt).toLocaleDateString('he-IL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : null;
  const timeLabel = shift ? `${shift.startTime} - ${shift.endTime}` : null;

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
          {shift ? (
            <>
              <h3 className="text-h2 font-bold mb-1">{dateLabel}</h3>
              <div className="flex items-center gap-2 text-primary-fixed-dim">
                <MaterialIcon name="schedule" className="text-[20px]" />
                <span className="text-h3 font-semibold">{timeLabel}</span>
              </div>
            </>
          ) : (
            <h3 className="text-h3 font-bold">אין משמרת קרובה בשבוע הנוכחי</h3>
          )}
        </div>

        {shift && (
          <div className="hidden sm:block text-center">
            <p className="text-xs text-primary-fixed-dim mb-1">פרטי משמרת</p>
            <p className="font-bold text-lg">שיבוץ אישי</p>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Card showing the countdown timer until the constraint submission deadline.
 *
 * Provides a direct CTA button to open the constraints form.
 */
function ConstraintCountdownCard({ onClick }: { onClick: () => void }) {
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
        <div
          className="text-error flex justify-center items-baseline gap-1"
          style={{ fontSize: '32px', lineHeight: 1, fontWeight: 700 }}
        >
          <span>2</span>
          <span className="text-lg font-semibold">ימים</span>
          <span className="mr-2">14</span>
          <span className="text-lg font-semibold">שעות</span>
        </div>
      </div>

      {/* CTA */}
      <button
        id="dashboard-submit-constraints-btn"
        onClick={onClick}
        className="w-full h-12 bg-secondary hover:bg-blue-700 text-white rounded-full font-bold transition-colors flex items-center justify-center gap-2"
      >
        <MaterialIcon name="edit_calendar" className="text-[18px]" />
        הגש אילוצים
      </button>
    </div>
  );
}

/**
 * Renders a list of this week's schedule rows.
 * Today is styled as "past shift", next shift highlighted in primary brand colour,
 * and days-off shown in muted text.
 */
function WeeklyOverviewCard({ days }: { days: EmployeeDashboardDay[] }) {
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
        {days.map((row) => {
          const dayName = row.date.toLocaleDateString('he-IL', { weekday: 'long' });
          const dayLabel = row.isToday ? `היום (${dayName})` : dayName;
          const shiftLabel =
            row.shifts.length > 0
              ? row.shifts.map((shift) => `${shift.startTime} - ${shift.endTime}`).join(' / ')
              : 'חופש';

          if (row.isNextShiftDay) {
            return (
              <div
                key={row.dateKey}
                className="flex justify-between items-center p-3 bg-primary-container text-white rounded-lg border border-primary"
              >
                <span className="text-sm font-medium">{dayLabel}</span>
                <span className="text-sm font-bold">{shiftLabel}</span>
              </div>
            );
          }

          if (row.isToday) {
            return (
              <div
                key={row.dateKey}
                className="flex justify-between items-center p-3 bg-surface-container-low rounded-lg border border-transparent"
              >
                <span className="text-on-surface text-sm">{dayLabel}</span>
                <span className="text-on-surface-variant text-sm opacity-70">{shiftLabel}</span>
              </div>
            );
          }

          return (
            <div
              key={row.dateKey}
              className="flex justify-between items-center p-3 bg-surface-container-lowest rounded-lg border border-surface-variant hover:border-outline-variant transition-colors"
            >
              <span className="text-on-surface text-sm">{dayLabel}</span>
              <span className="text-sm font-bold text-on-surface-variant">{shiftLabel}</span>
            </div>
          );
        })}
      </div>

      <Link
        to="/schedule"
        className="mt-4 h-11 w-full rounded-full bg-primary text-white font-bold transition-colors hover:bg-blue-800 flex items-center justify-center gap-2"
      >
        <MaterialIcon name="calendar_view_week" className="text-[18px]" />
        צפה בסידור המלא
      </Link>
    </div>
  );
}

/**
 * Right-column notifications panel with unread badge and message list.
 */
export function NotificationsPanel() {
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

function DashboardEmptyState({ message }: { message: string }) {
  return (
    <section className="bg-surface-container-lowest rounded-xl p-xl shadow-bezeq-card border border-surface-variant min-h-[160px] flex items-center justify-center text-center">
      <div>
        <MaterialIcon name="event_busy" className="text-outline text-[36px] mb-3" />
        <p className="text-h3 font-bold text-on-surface">{message}</p>
      </div>
    </section>
  );
}

function getEmptyMessage(data: EmployeeDashboardData): string | null {
  if (data.emptyReason === 'no_published_schedule') {
    return 'לא נמצא סידור מפורסם לשבוע הקרוב';
  }

  if (data.emptyReason === 'no_assignments') {
    return 'אין לך משמרות משובצות כרגע';
  }

  return null;
}

const QUICK_ACTIONS = [
  { icon: 'flight_takeoff', label: 'בקשת חופשה', iconColorClass: 'text-secondary' },
  { icon: 'medical_services', label: 'דיווח מחלה', iconColorClass: 'text-error' },
  { icon: 'person_edit', label: 'עדכון פרטים', iconColorClass: 'text-primary' },
  { icon: 'chat', label: 'פנייה למנהל', iconColorClass: 'text-on-surface-variant' },
];

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

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const dashboard = useEmployeeDashboardData(user?.role === 'employee');
  const emptyMessage = dashboard.data ? getEmptyMessage(dashboard.data) : null;

  // Redirect admin / manager users to the admin dashboard
  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'manager')) {
      navigate('/admin');
    }
  }, [user, navigate]);

  return (
    <MainLayout
      title={`שלום, ${user?.name || 'ישראל ישראלי'}`}
      subtitle={new Date().toLocaleDateString('he-IL', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })}
      actions={
        <div className="bg-surface-container px-4 py-2 rounded-full border border-outline-variant flex items-center gap-2 text-on-surface-variant">
          <MaterialIcon name="calendar_view_week" className="text-[18px]" />
          <span className="text-sm font-bold">
            <WeekLabel weekId={getCurrentWeekId()} />
          </span>
        </div>
      }
    >
      <PageDataBoundary
        loading={dashboard.loading}
        error={dashboard.error}
        onRetry={dashboard.reload}
        loadingText="טוען נתונים..."
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left / main column (8 of 12) */}
          <div className="lg:col-span-8 space-y-5">
            {emptyMessage ? (
              <DashboardEmptyState message={emptyMessage} />
            ) : (
              dashboard.data && <HeroShiftCard shift={dashboard.data.nextShift} />
            )}

            {/* Two-up bento row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ConstraintCountdownCard onClick={() => navigate('/constraints')} />
              {dashboard.data && !emptyMessage && (
                <WeeklyOverviewCard days={dashboard.data.weekDays} />
              )}
            </div>
          </div>

          {/* Right / secondary column (4 of 12) */}
          <div className="lg:col-span-4 space-y-5">
            <QuickActionsPanel />
          </div>
        </div>
      </PageDataBoundary>
    </MainLayout>
  );
}
