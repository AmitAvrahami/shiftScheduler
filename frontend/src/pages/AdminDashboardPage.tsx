import { useState } from 'react';
import { useParams } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import { getCurrentWeekId, parseWeekId } from '../utils/weekUtils';
import { useAdminDashboard } from './admin/hooks/useAdminDashboard';
import type { Toast } from './admin/types';
import { AuditLogPanel } from './admin/components/AuditLogPanel';
import { BroadcastCenterPanel } from './admin/components/BroadcastPanel';
import { QuickActionsPanel } from './admin/components/QuickActionsPanel';
import { DashboardSummaryPanel } from './admin/components/DashboardSummaryPanel';
import { MissingConstraintsPanel } from './admin/components/MissingConstraintsPanel';
import { GeneratedSchedulePanel } from './admin/components/GeneratedSchedulePanel';
import { ScheduleBoard } from './admin/components/ScheduleBoard';
import { ShiftOverviewPanel } from './admin/components/ShiftOverviewPanel';
import { getScheduleStats } from './admin/utils/scheduleStats';

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { weekId: paramWeekId } = useParams<{ weekId: string }>();
  const [toast, setToast] = useState<Toast | null>(null);

  const weekId = paramWeekId || getCurrentWeekId();
  let weekNumber: number | null = null;
  let weekIdError: string | null = null;
  try {
    weekNumber = parseWeekId(weekId).week;
  } catch {
    weekIdError = `מזהה שבוע לא תקין: ${weekId}`;
  }
  const { dashboard, loading, error, actions, generateResult, clearGenerateResult, actionLoading } =
    useAdminDashboard(weekId);
  const employees = (dashboard?.employees ?? []).filter((u) => u.isActive);
  const scheduleStats = dashboard ? getScheduleStats(dashboard) : null;

  return (
    <MainLayout title="דאשבורד מנהל" subtitle={weekNumber !== null ? `שבוע ${weekNumber}` : ''}>
      <div className="space-y-6">
        {weekIdError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm font-bold text-red-700">
            {weekIdError}
          </div>
        )}

        {!weekIdError && (
          <>
            {/* Quick Actions at the top */}
            <QuickActionsPanel
              weekId={weekId}
              onToast={setToast}
              onGenerate={actions.generateSchedule}
              onGenerateDemo={actions.generateDemoSchedule}
              isGenerating={actionLoading.generating}
              isGeneratingDemo={actionLoading.generatingDemo}
            />

            {generateResult && (
              <GeneratedSchedulePanel result={generateResult} onClose={clearGenerateResult} />
            )}

            {loading && !dashboard && (
              <div className="bg-white border border-[#e2e8f0] rounded-xl p-6 text-sm text-on-surface-variant shadow-bezeq-card">
                טוען נתוני דאשבורד...
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm font-bold text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Main content column */}
              <div className="xl:col-span-2 space-y-6">
                {dashboard && (
                  <ScheduleBoard
                    shifts={dashboard.shifts}
                    assignments={dashboard.assignments}
                    employees={employees}
                    warnings={generateResult?.warnings}
                  />
                )}
                <ShiftOverviewPanel
                  weekId={weekId}
                  employees={employees}
                  shifts={dashboard?.shifts ?? []}
                  assignments={dashboard?.assignments ?? []}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <BroadcastCenterPanel recipientCount={employees.length} onToast={setToast} />
                  <MissingConstraintsPanel missingUsers={dashboard?.missingConstraints ?? null} />
                </div>
              </div>

              {/* Side content column */}
              <div className="xl:col-span-1 space-y-6">
                <DashboardSummaryPanel
                  weekNumber={weekNumber ?? 0}
                  totalUsers={employees.length}
                  stats={scheduleStats}
                />
                <AuditLogPanel logs={dashboard?.auditLogs ?? null} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 transition-all ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : toast.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          <MaterialIcon
            name={
              toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info'
            }
          />
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-50 hover:opacity-100">
            <MaterialIcon name="close" className="text-[16px]" />
          </button>
        </div>
      )}
    </MainLayout>
  );
}
