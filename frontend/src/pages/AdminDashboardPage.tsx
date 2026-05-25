import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import { getCurrentWeekId, parseWeekId } from '../utils/weekUtils';
import { WeekLabel } from '../components/WeekLabel';
import { useAdminDashboard } from './admin/hooks/useAdminDashboard';
import type { Toast } from './admin/types';
import { AuditLogPanel } from './admin/components/AuditLogPanel';
import { BroadcastCenterPanel } from './admin/components/BroadcastPanel';
import { QuickActionsPanel } from './admin/components/QuickActionsPanel';
import { DashboardSummaryPanel } from './admin/components/DashboardSummaryPanel';
import { MissingConstraintsPanel } from './admin/components/MissingConstraintsPanel';
import { GeneratedSchedulePanel } from './admin/components/GeneratedSchedulePanel';
import { GenerateScheduleWizard } from './admin/components/GenerateScheduleWizard';
import { ScheduleBoard } from './admin/components/ScheduleBoard';
import { ShiftOverviewPanel } from './admin/components/ShiftOverviewPanel';
import { QualityScorePanel } from './admin/components/QualityScorePanel';
import { getScheduleStats } from './admin/utils/scheduleStats';
import { PageDataBoundary } from '../components/ui/PageDataBoundary';
import { scheduleApi } from '../lib/api';
import type { GenerateResult } from '../lib/api';

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { weekId: paramWeekId } = useParams<{ weekId: string }>();
  const [toast, setToast] = useState<Toast | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardResult, setWizardResult] = useState<GenerateResult | null>(null);

  const weekId = paramWeekId || getCurrentWeekId();
  let weekNumber: number | null = null;
  let weekIdError: string | null = null;
  try {
    weekNumber = parseWeekId(weekId).week;
  } catch {
    weekIdError = `מזהה שבוע לא תקין: ${weekId}`;
  }
  const { dashboard, loading, error, generateResult, clearGenerateResult, refresh } =
    useAdminDashboard(weekId);
  const employees = (dashboard?.employees ?? []).filter((u) => u.isActive);
  const scheduleStats = dashboard ? getScheduleStats(dashboard) : null;
  const visibleResult = wizardResult ?? generateResult;
  const handleCloseResult = wizardResult ? () => setWizardResult(null) : clearGenerateResult;
  const visibleGenerationScore =
    visibleResult?.generationScore ?? dashboard?.generationScore ?? null;

  const handleWizardGenerate = useCallback((wid: string) => scheduleApi.generate(wid), []);

  return (
    <MainLayout
      title="דאשבורד מנהל"
      subtitle={weekNumber !== null ? <WeekLabel weekId={weekId} /> : ''}
    >
      <div className="space-y-6">
        {weekIdError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm font-bold text-red-700">
            {weekIdError}
          </div>
        )}

        {!weekIdError && (
          <>
            <PageDataBoundary
              loading={loading && !dashboard}
              error={!dashboard ? error : null}
              onRetry={refresh}
              loadingText="טוען נתוני דאשבורד..."
            >
              {/* Quick Actions at the top */}
              <QuickActionsPanel
                weekId={weekId}
                onToast={setToast}
                onOpenGenerateWizard={() => setWizardOpen(true)}
              />

              {visibleResult && (
                <GeneratedSchedulePanel
                  result={visibleResult}
                  employees={employees}
                  onClose={handleCloseResult}
                />
              )}

              {/* Refresh failure while data is already loaded — surface inline,
                  keep the board visible. */}
              {error && dashboard && (
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
                      warnings={visibleResult?.warnings ?? dashboard.generationWarnings}
                      variant="compact"
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
                  <QualityScorePanel score={visibleGenerationScore} />
                  <AuditLogPanel logs={dashboard?.auditLogs ?? null} />
                </div>
              </div>
            </PageDataBoundary>
          </>
        )}
      </div>

      <GenerateScheduleWizard
        open={wizardOpen}
        initialWeekId={weekId}
        onClose={() => setWizardOpen(false)}
        onGenerate={handleWizardGenerate}
        onGenerated={(result) => {
          setWizardResult(result);
          setWizardOpen(false);
          setToast({ message: 'לוח שיבוץ הופק בהצלחה!', type: 'success' });
          refresh();
        }}
      />

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
