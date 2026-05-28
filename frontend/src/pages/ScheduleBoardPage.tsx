import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import { getCurrentWeekId, getNextWeekId, getPrevWeekId } from '../utils/weekUtils';
import { WeekLabel } from '../components/WeekLabel';
import { ScheduleBoard, type MoveAssignmentArgs } from './admin/components/ScheduleBoard';
import { WeeklyStaffingEditor } from './admin/components/WeeklyStaffingEditor';
import { useAdminDashboard } from './admin/hooks/useAdminDashboard';
import { shiftDefinitionApi, constraintApi, assignmentApi } from '../lib/api';
import { detectPublishWarnings, type PublishWarning } from '../utils/partialAvailabilityWarnings';
import { detectAssignmentConflicts, type AssignmentWarning } from '../utils/assignmentConflicts';
import type { Constraint, ShiftDefinition } from '../types/constraint';
import { PublishWarningsDialog } from './admin/components/PublishWarningsDialog';
import { ShiftAssignmentModal } from './admin/components/ShiftAssignmentModal';
import { AssignmentWarningsDialog } from './admin/components/AssignmentWarningsDialog';
import { PageDataBoundary } from '../components/ui/PageDataBoundary';
import { UndoToast } from '../components/ui/UndoToast';
import {
  getDayLabel,
  getShiftTypeLabel,
  normalizeShiftDay,
} from './admin/utils/scheduleBoardUtils';
import type { AdminDashboardShift, AdminDashboardDTO } from './admin/types';

type PendingUndo =
  | { kind: 'assign'; assignmentId: string; message: string }
  | {
      kind: 'remove';
      shiftId: string;
      userId: string;
      scheduleId: string;
      message: string;
    }
  | {
      kind: 'move';
      revertAssignmentId: string;
      fromShiftId: string;
      userId: string;
      scheduleId: string;
      message: string;
    };

type PendingMove = {
  sourceAssignmentId: string;
  fromShiftId: string;
  toShiftId: string;
  userId: string;
  warnings: AssignmentWarning[];
};

function buildShiftLabel(shift: AdminDashboardShift): string {
  const day = normalizeShiftDay(shift.day);
  const dayLabel = day ? getDayLabel(day) : shift.day;
  return `${getShiftTypeLabel(shift.type)}, ${dayLabel}`;
}

function findEmployeeName(dashboard: AdminDashboardDTO, employeeId: string): string {
  return dashboard.employees.find((e) => e.id === employeeId)?.name ?? '';
}

interface ToastMsg {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastSeq = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  const show = useCallback((message: string, type: ToastMsg['type'] = 'info') => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  return { toasts, show };
}

function ToastStack({ toasts }: { toasts: ToastMsg[] }) {
  const colors: Record<ToastMsg['type'], string> = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-[#101B79]',
  };

  return (
    <div className="fixed bottom-24 left-4 z-50 flex flex-col gap-2" dir="rtl">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${colors[toast.type]} text-white text-sm font-semibold px-md py-sm rounded-lg shadow-xl`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ScheduleBoardPage() {
  const { weekId: paramWeekId } = useParams<{ weekId: string }>();
  const navigate = useNavigate();

  const weekId = paramWeekId || getCurrentWeekId();
  const [showStaffingModal, setShowStaffingModal] = useState(false);
  const [isVerifyingPublish, setIsVerifyingPublish] = useState(false);
  const [publishWarnings, setPublishWarnings] = useState<PublishWarning[]>([]);
  const [showPublishWarningsModal, setShowPublishWarningsModal] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [assignTargetShiftId, setAssignTargetShiftId] = useState<string | null>(null);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [shiftDefinitions, setShiftDefinitions] = useState<ShiftDefinition[]>([]);
  const [pendingAssignment, setPendingAssignment] = useState<{
    shiftId: string;
    userId: string;
    warnings: AssignmentWarning[];
  } | null>(null);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const { toasts, show: showToast } = useToast();

  const { dashboard, loading, error, refreshing, refresh, actions } = useAdminDashboard(weekId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [defsRes, constraintsRes] = await Promise.all([
          shiftDefinitionApi.getActive(),
          constraintApi.getAllConstraints(weekId),
        ]);
        if (cancelled) return;
        setShiftDefinitions(defsRes.success ? defsRes.definitions : []);
        setConstraints(constraintsRes.success ? constraintsRes.constraints : []);
      } catch (e) {
        if (cancelled) return;
        console.error('Failed to prefetch constraints / shift definitions:', e);
        setShiftDefinitions([]);
        setConstraints([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekId]);

  async function handleGenerate() {
    await actions.generateSchedule();
  }

  async function handlePublish() {
    if (!dashboard) return;
    setPageError(null);
    try {
      setIsVerifyingPublish(true);
      if (shiftDefinitions.length > 0) {
        const warnings = detectPublishWarnings(
          dashboard.assignments,
          dashboard.shifts,
          constraints,
          dashboard.employees,
          shiftDefinitions
        );

        if (warnings.length > 0) {
          setPublishWarnings(warnings);
          setShowPublishWarningsModal(true);
          return;
        }
      }
    } catch (e) {
      console.error('Failed to detect publish warnings:', e);
      setPageError('שגיאה בבדיקת אזהרות פרסום');
    } finally {
      setIsVerifyingPublish(false);
    }

    const published = await actions.publishSchedule();
    if (published) showToast('הסידור פורסם בהצלחה', 'success');
  }

  async function handleConfirmPublish() {
    setShowPublishWarningsModal(false);
    const published = await actions.publishSchedule(publishWarnings);
    if (published) showToast('הסידור פורסם בהצלחה', 'success');
  }

  async function handleInitialize() {
    await actions.initializeWeek();
  }

  async function performAssignWithUndo(shiftId: string, userId: string) {
    if (!dashboard) return;
    const shift = dashboard.shifts.find((s) => s.id === shiftId);
    const employeeName = findEmployeeName(dashboard, userId);
    const shiftLabel = shift ? buildShiftLabel(shift) : '';
    const newAssignmentId = await actions.assignEmployee(shiftId, userId);
    if (newAssignmentId) {
      setPendingUndo({
        kind: 'assign',
        assignmentId: newAssignmentId,
        message: `נוסף שיבוץ: ${employeeName} → ${shiftLabel}`,
      });
    }
  }

  async function performRemoveWithUndo(assignmentId: string) {
    if (!dashboard || !dashboard.scheduleId) return;
    const assignment = dashboard.assignments.find((a) => a.id === assignmentId);
    if (!assignment) {
      await actions.removeEmployee(assignmentId);
      return;
    }
    const shift = dashboard.shifts.find((s) => s.id === assignment.shiftId);
    const employeeName = findEmployeeName(dashboard, assignment.employeeId);
    const shiftLabel = shift ? buildShiftLabel(shift) : '';
    const snapshot = {
      shiftId: assignment.shiftId,
      userId: assignment.employeeId,
      scheduleId: dashboard.scheduleId,
    };
    const ok = await actions.removeEmployee(assignmentId);
    if (ok) {
      setPendingUndo({
        kind: 'remove',
        ...snapshot,
        message: `הוסר שיבוץ: ${employeeName} → ${shiftLabel}`,
      });
    }
  }

  async function performMoveWithUndo(
    sourceAssignmentId: string,
    fromShiftId: string,
    toShiftId: string,
    userId: string
  ) {
    if (!dashboard || !dashboard.scheduleId) return;
    const scheduleId = dashboard.scheduleId;
    const employeeName = findEmployeeName(dashboard, userId);
    const toShift = dashboard.shifts.find((s) => s.id === toShiftId);
    const toShiftLabel = toShift ? buildShiftLabel(toShift) : '';

    let newAssignmentId: string | null = null;
    try {
      const createRes = await assignmentApi.create({
        shiftId: toShiftId,
        userId,
        scheduleId,
        assignedBy: 'manager',
      });
      newAssignmentId = createRes?.assignment?._id ?? null;
    } catch {
      setPageError('הפעולה לא הצליחה');
      return;
    }
    if (!newAssignmentId) {
      setPageError('הפעולה לא הצליחה');
      await refresh();
      return;
    }

    try {
      await assignmentApi.delete(sourceAssignmentId);
    } catch {
      setPageError('הפעולה לא הצליחה');
      await refresh();
      return;
    }

    await refresh();
    setPendingUndo({
      kind: 'move',
      revertAssignmentId: newAssignmentId,
      fromShiftId,
      userId,
      scheduleId,
      message: `הועבר שיבוץ: ${employeeName} → ${toShiftLabel}`,
    });
  }

  function handleMoveAssignment({
    sourceAssignmentId,
    fromShiftId,
    toShiftId,
    userId,
  }: MoveAssignmentArgs) {
    if (!dashboard) return;
    if (fromShiftId === toShiftId) return;
    const targetShift = dashboard.shifts.find((s) => s.id === toShiftId);
    if (!targetShift) return;
    const alreadyOnTarget = dashboard.assignments.some(
      (a) => a.shiftId === toShiftId && a.employeeId === userId
    );
    if (alreadyOnTarget) return;

    const warnings = detectAssignmentConflicts({
      targetShift,
      candidateEmployeeId: userId,
      employees: dashboard.employees,
      shifts: dashboard.shifts,
      assignments: dashboard.assignments.filter((a) => a.id !== sourceAssignmentId),
      constraints,
      shiftDefinitions,
    });

    if (warnings.length === 0) {
      void performMoveWithUndo(sourceAssignmentId, fromShiftId, toShiftId, userId);
    } else {
      setPendingMove({ sourceAssignmentId, fromShiftId, toShiftId, userId, warnings });
    }
  }

  async function handleUndo() {
    if (!pendingUndo || undoBusy) return;
    setUndoBusy(true);
    setPageError(null);
    try {
      if (pendingUndo.kind === 'assign') {
        await assignmentApi.delete(pendingUndo.assignmentId);
      } else if (pendingUndo.kind === 'remove') {
        await assignmentApi.create({
          shiftId: pendingUndo.shiftId,
          userId: pendingUndo.userId,
          scheduleId: pendingUndo.scheduleId,
          assignedBy: 'manager',
        });
      } else {
        await assignmentApi.delete(pendingUndo.revertAssignmentId);
        await assignmentApi.create({
          shiftId: pendingUndo.fromShiftId,
          userId: pendingUndo.userId,
          scheduleId: pendingUndo.scheduleId,
          assignedBy: 'manager',
        });
      }
      await refresh();
    } catch {
      setPageError('הפעולה לא הצליחה');
    } finally {
      setPendingUndo(null);
      setUndoBusy(false);
    }
  }

  const hasSchedule = Boolean(dashboard?.scheduleId);
  const isDraft = dashboard?.scheduleStatus === 'draft';

  return (
    <MainLayout
      title="סידור עבודה"
      subtitle={<WeekLabel weekId={weekId} />}
      actions={
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-full border border-slate-200">
            <button
              onClick={() => navigate(`/schedules/${getPrevWeekId(weekId)}`)}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all"
            >
              <MaterialIcon name="chevron_right" />
            </button>
            <div className="px-3 font-bold text-slate-700 text-xs">{weekId}</div>
            <button
              onClick={() => navigate(`/schedules/${getNextWeekId(weekId)}`)}
              className="p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all"
            >
              <MaterialIcon name="chevron_left" />
            </button>
          </div>

          <button
            onClick={() => setShowStaffingModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-[#2B358F] border border-[#e2e8f0] rounded-full font-bold text-sm hover:bg-[#F1F8FF] hover:border-[#056AE5] transition-all"
          >
            <MaterialIcon name="tune" className="text-[18px]" />
            הגדרת תקן שבועי
          </button>

          {/* Publish/generate depend on the loaded schedule — render only once
              the dashboard data exists. */}
          {dashboard && (
            <>
              {isDraft && (
                <button
                  onClick={handlePublish}
                  disabled={refreshing || isVerifyingPublish}
                  className="flex items-center gap-2 px-4 py-2 bg-[#056AE5] text-white rounded-full font-bold text-sm hover:bg-[#0457B8] transition-all shadow-md disabled:opacity-50"
                >
                  {isVerifyingPublish ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <MaterialIcon name="send" className="text-[18px]" />
                  )}
                  {isVerifyingPublish ? 'בודק אילוצים...' : 'פרסם סידור'}
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
            </>
          )}
        </div>
      }
    >
      <PageDataBoundary
        loading={loading && !dashboard}
        error={!dashboard ? error : null}
        onRetry={refresh}
        loadingText="טוען סידור עבודה..."
      >
        <div className="flex flex-col gap-6" dir="rtl">
          {/* Refresh failure while data is already loaded — surface inline. */}
          {error && dashboard && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          {pageError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {pageError}
            </div>
          )}

          {!hasSchedule && (
            <div className="p-12 bg-slate-50 border border-slate-200 border-dashed rounded-3xl text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <MaterialIcon name="calendar_today" className="text-slate-400 text-4xl" />
              </div>
              <h3 className="text-2xl font-black text-[#010636] mb-3">אין סידור עבודה לשבוע זה</h3>
              <p className="text-slate-500 mb-8 max-w-md mx-auto">
                טרם נוצר סידור עבודה לשבוע שנבחר. ניתן לייצר סידור חדש המבוסס על תבניות המשמרות
                הקבועות.
              </p>
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
              warnings={dashboard.generationWarnings}
              onAssignEmployee={(shiftId) => setAssignTargetShiftId(shiftId)}
              onRemoveEmployee={(assignmentId) => performRemoveWithUndo(assignmentId)}
              onMoveAssignment={handleMoveAssignment}
              dragDisabled={refreshing}
            />
          )}
        </div>
      </PageDataBoundary>

      {showStaffingModal && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center pt-16 pb-6 px-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          dir="rtl"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowStaffingModal(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[calc(100vh-5rem)]">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-black text-[#000654]">הגדרת כמות עובדים למשמרות השבוע</h2>
              <button
                onClick={() => setShowStaffingModal(false)}
                className="p-2 hover:bg-white rounded-full transition-colors"
              >
                <MaterialIcon name="close" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <WeeklyStaffingEditor weekId={weekId} />
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
              <button
                onClick={() => setShowStaffingModal(false)}
                className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      <PublishWarningsDialog
        open={showPublishWarningsModal}
        warnings={publishWarnings}
        onCancel={() => setShowPublishWarningsModal(false)}
        onConfirm={handleConfirmPublish}
      />

      <ShiftAssignmentModal
        open={assignTargetShiftId !== null}
        shift={dashboard?.shifts.find((shift) => shift.id === assignTargetShiftId) ?? null}
        employees={dashboard?.employees ?? []}
        assignedEmployeeIds={
          new Set(
            (dashboard?.assignments ?? [])
              .filter((assignment) => assignment.shiftId === assignTargetShiftId)
              .map((assignment) => assignment.employeeId)
          )
        }
        busy={refreshing}
        onCancel={() => setAssignTargetShiftId(null)}
        onConfirm={async (userId) => {
          if (!assignTargetShiftId || !dashboard) return;
          const shiftId = assignTargetShiftId;
          const targetShift = dashboard.shifts.find((s) => s.id === shiftId);
          if (!targetShift) {
            setAssignTargetShiftId(null);
            return;
          }
          const warnings = detectAssignmentConflicts({
            targetShift,
            candidateEmployeeId: userId,
            employees: dashboard.employees,
            shifts: dashboard.shifts,
            assignments: dashboard.assignments,
            constraints,
            shiftDefinitions,
          });
          setAssignTargetShiftId(null);
          if (warnings.length === 0) {
            await performAssignWithUndo(shiftId, userId);
          } else {
            setPendingAssignment({ shiftId, userId, warnings });
          }
        }}
      />

      <AssignmentWarningsDialog
        open={pendingAssignment !== null}
        warnings={pendingAssignment?.warnings ?? []}
        onCancel={() => setPendingAssignment(null)}
        onConfirm={async () => {
          if (!pendingAssignment) return;
          const { shiftId, userId } = pendingAssignment;
          setPendingAssignment(null);
          await performAssignWithUndo(shiftId, userId);
        }}
      />

      <AssignmentWarningsDialog
        open={pendingMove !== null}
        warnings={pendingMove?.warnings ?? []}
        onCancel={() => setPendingMove(null)}
        onConfirm={async () => {
          if (!pendingMove) return;
          const { sourceAssignmentId, fromShiftId, toShiftId, userId } = pendingMove;
          setPendingMove(null);
          await performMoveWithUndo(sourceAssignmentId, fromShiftId, toShiftId, userId);
        }}
      />

      {pendingUndo && (
        <UndoToast
          message={pendingUndo.message}
          onUndo={handleUndo}
          onDismiss={() => setPendingUndo(null)}
          busy={undoBusy || refreshing}
        />
      )}

      <ToastStack toasts={toasts} />
    </MainLayout>
  );
}
