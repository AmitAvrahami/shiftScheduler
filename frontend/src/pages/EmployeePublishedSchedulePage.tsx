import { useCallback, useEffect, useRef, useState } from 'react';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import { PageDataBoundary } from '../components/ui/PageDataBoundary';
import { WeekLabel } from '../components/WeekLabel';
import { useAuth } from '../hooks/useAuth';
import { scheduleApi, type PublishedScheduleView } from '../lib/api';
import { getCurrentWeekId } from '../utils/weekUtils';
import { ScheduleBoard } from './admin/components/ScheduleBoard';
import type { AdminDashboardDTO } from './admin/types';

const NO_PUBLISHED_SCHEDULE = 'לא נמצא סידור מפורסם לשבוע הקרוב';
const EMPTY_ASSIGNMENTS = 'אין שיבוצים להצגה';
const LOAD_ERROR = 'שגיאה בטעינת הסידור המלא';

type PublishedScheduleBoardData = {
  weekId: string;
  view: PublishedScheduleView | null;
  emptyMessage: string | null;
};

function toBoardEmployees(
  employees: PublishedScheduleView['employees']
): AdminDashboardDTO['employees'] {
  return employees.map((employee) => ({
    id: employee.id,
    name: employee.name,
    role: 'employee',
    isActive: true,
    isFixedMorningEmployee: false,
  }));
}

export default function EmployeePublishedSchedulePage() {
  const { user } = useAuth();
  const [data, setData] = useState<PublishedScheduleBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setError(null);

    try {
      const weekId = getCurrentWeekId();
      const schedulesRes = await scheduleApi.getAll();
      const schedule =
        schedulesRes.schedules.find((candidate) => {
          if (candidate.weekId !== weekId) return false;
          if (user?.role === 'manager' || user?.role === 'admin') {
            return candidate.status === 'published';
          }
          return true;
        }) ?? null;

      if (!schedule) {
        if (requestIdRef.current !== requestId) return;
        setData({ weekId, view: null, emptyMessage: NO_PUBLISHED_SCHEDULE });
        return;
      }

      const viewRes = await scheduleApi.getPublishedView(schedule._id);
      if (requestIdRef.current !== requestId) return;

      setData({
        weekId,
        view: viewRes.data,
        emptyMessage: viewRes.data.assignments.length === 0 ? EMPTY_ASSIGNMENTS : null,
      });
    } catch {
      if (requestIdRef.current !== requestId) return;
      setError(LOAD_ERROR);
      setData(null);
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [user?.role]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    load();
    return () => {
      requestIdRef.current += 1;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  const weekId = data?.weekId ?? getCurrentWeekId();
  const boardEmployees = data?.view ? toBoardEmployees(data.view.employees) : [];

  return (
    <MainLayout title="הסידור השבועי המלא" subtitle={<WeekLabel weekId={weekId} />}>
      <PageDataBoundary loading={loading} error={error} onRetry={load} loadingText="טוען סידור...">
        <section className="space-y-4" dir="rtl">
          <div>
            <h2 className="text-2xl font-black text-[#010636]">הסידור השבועי המלא</h2>
          </div>

          {data?.emptyMessage ? (
            <div className="rounded-lg border border-surface-variant bg-surface-container-lowest p-xl text-center shadow-bezeq-card">
              <MaterialIcon name="calendar_month" className="mb-3 text-[36px] text-outline" />
              <p className="text-lg font-bold text-on-surface">{data.emptyMessage}</p>
            </div>
          ) : data?.view ? (
            <ScheduleBoard
              variant="full"
              readOnly
              shifts={data.view.shifts}
              assignments={data.view.assignments}
              employees={boardEmployees}
            />
          ) : null}
        </section>
      </PageDataBoundary>
    </MainLayout>
  );
}
