import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import {
  getCurrentWeekId,
  getNextWeekId,
  getPrevWeekId,
  getWeekDates,
} from '../utils/weekUtils';
import { ScheduleBoard } from './admin/components/ScheduleBoard';
import { useAdminDashboard } from './admin/hooks/useAdminDashboard';

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ScheduleBoardPage() {
  const { weekId: paramWeekId } = useParams<{ weekId: string }>();
  const navigate = useNavigate();

  const weekId = paramWeekId || getCurrentWeekId();
  const weekDates = useMemo(() => getWeekDates(weekId), [weekId]);
  const { dashboard, loading, error, refreshing, refresh, actions } = useAdminDashboard(weekId);

  const formattedWeekRange = useMemo(() => {
    if (weekDates.length < 7) return '';
    const start = weekDates[0];
    const end = weekDates[6];
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return `${start.toLocaleDateString('he-IL', options)} - ${end.toLocaleDateString('he-IL', options)}, ${start.getFullYear()}`;
  }, [weekDates]);

  async function handleGenerate() {
    await actions.generateSchedule();
  }

  async function handlePublish() {
    await actions.publishSchedule();
  }

  async function handleInitialize() {
    await actions.initializeWeek();
  }

  if (loading && !dashboard) {
    return (
      <MainLayout title="סידור עבודה" subtitle={weekId}>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 font-medium">טוען סידור עבודה...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error && !dashboard) {
    return (
      <MainLayout title="סידור עבודה" subtitle={weekId}>
        <div className="p-8 bg-red-50 border border-red-100 rounded-2xl text-center">
          <MaterialIcon name="error" className="text-red-500 text-5xl mb-4" />
          <h3 className="text-xl font-bold text-red-900 mb-2">אופס! משהו השתבש</h3>
          <p className="text-red-700 mb-6">{error}</p>
          <button onClick={refresh} className="px-6 py-2 bg-red-600 text-white rounded-full font-bold hover:bg-red-700 transition-colors">
            נסה שוב
          </button>
        </div>
      </MainLayout>
    );
  }

  const hasSchedule = Boolean(dashboard?.scheduleId);
  const isDraft = dashboard?.scheduleStatus === 'draft';

  return (
    <MainLayout
      title="סידור עבודה"
      subtitle={`שבוע ${weekId.split('-W')[1]} (${formattedWeekRange})`}
      actions={
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-full border border-slate-200">
            <button
              onClick={() => navigate(`/schedules/${getPrevWeekId(weekId)}`)}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all"
            >
              <MaterialIcon name="chevron_right" />
            </button>
            <div className="px-3 font-bold text-slate-700 text-xs">
              {weekId}
            </div>
            <button
              onClick={() => navigate(`/schedules/${getNextWeekId(weekId)}`)}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all"
            >
              <MaterialIcon name="chevron_left" />
            </button>
          </div>

          {isDraft && (
            <button
              onClick={handlePublish}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-[#056AE5] text-white rounded-full font-bold text-sm hover:bg-[#0457B8] transition-all shadow-md disabled:opacity-50"
            >
              <MaterialIcon name="send" className="text-[18px]" />
              פרסם סידור
            </button>
          )}

          <button
            onClick={handleGenerate}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-[#101B79] text-white rounded-full font-bold text-sm hover:bg-[#0c1461] transition-all shadow-md disabled:opacity-50"
          >
            {refreshing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <MaterialIcon name="auto_awesome" className="text-[18px]" />
            )}
            ייצור אוטומטי
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6" dir="rtl">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {!hasSchedule && !loading && (
          <div className="p-12 bg-slate-50 border border-slate-200 border-dashed rounded-3xl text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <MaterialIcon name="calendar_today" className="text-slate-400 text-4xl" />
            </div>
            <h3 className="text-2xl font-black text-[#010636] mb-3">אין סידור עבודה לשבוע זה</h3>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">טרם נוצר סידור עבודה לשבוע שנבחר. ניתן לייצר סידור חדש המבוסס על תבניות המשמרות הקבועות.</p>
            <button
              onClick={handleInitialize}
              disabled={refreshing}
              className="px-8 py-3 bg-[#056AE5] text-white rounded-full font-black hover:bg-[#0457B8] transition-all shadow-xl hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              צור סידור חדש
            </button>
          </div>
        )}

        {hasSchedule && dashboard && (
          <ScheduleBoard
            shifts={dashboard.shifts}
            assignments={dashboard.assignments}
            employees={dashboard.employees}
            onAssignEmployee={(shiftId) => alert(`הוספת עובד למשמרת ${shiftId} (בקרוב)`)}
          />
        )}
      </div>
    </MainLayout>
  );
}
