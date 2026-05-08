import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import { notificationApi } from '../lib/api';
import type { BroadcastRecipient } from '../lib/api';
import { useAdminDashboard } from './admin/hooks/useAdminDashboard';
import type { AdminDashboardDTO, Toast } from './admin/types';
import { QuickActionsPanel } from './admin/components/QuickActionsPanel';
import { DashboardSummaryPanel } from './admin/components/DashboardSummaryPanel';
import { MissingConstraintsPanel } from './admin/components/MissingConstraintsPanel';
import { GeneratedSchedulePanel } from './admin/components/GeneratedSchedulePanel';
import { ShiftCard, type ShiftDef, type StaffEntry } from './admin/components/ShiftCard';
import { getScheduleStats } from './admin/utils/scheduleStats';
import { avatarBg, avatarInitials } from './admin/utils/avatarUtils';
import { normalizeShiftDay, type WeekDayKey } from './admin/utils/scheduleBoardUtils';

// ─── Week utilities ───────────────────────────────────────────────────────────

const IST_OFFSET_MS = 3 * 60 * 60 * 1000;

function getCurrentWeekId(): string {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const thursday = new Date(
    Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate())
  );
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function parseWeekNumber(weekId: string): number {
  return parseInt(weekId.split('-W')[1], 10);
}

// ─── Shift definitions ────────────────────────────────────────────────────────

// UI display config only — labels, colors, icons, display times.
// Shift counts, assignments, and required employees come from dashboard.shifts.
// TODO: future dynamic shift definitions should come from the ShiftDefinition API;
//       remove this static list when the backend exposes shift metadata per week.
const SHIFTS: ShiftDef[] = [
  {
    id: 'morning',
    label: 'בוקר',
    start: '06:45',
    end: '14:45',
    color: '#f59e0b',
    dimBg: 'rgba(245,158,11,0.15)',
    icon: 'wb_sunny',
  },
  {
    id: 'afternoon',
    label: 'אחה"צ',
    start: '14:45',
    end: '22:45',
    color: '#8b5cf6',
    dimBg: 'rgba(139,92,246,0.15)',
    icon: 'light_mode',
  },
  {
    id: 'night',
    label: 'לילה',
    start: '22:45',
    end: '06:45',
    color: '#06b6d4',
    dimBg: 'rgba(6,182,212,0.15)',
    icon: 'dark_mode',
  },
];

const WEEK_DAY_KEYS: WeekDayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function getCurrentShiftIndex(now: Date): number {
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= 6 * 60 + 45 && mins < 14 * 60 + 45) return 0;
  if (mins >= 14 * 60 + 45 && mins < 22 * 60 + 45) return 1;
  return 2;
}

// ─── Action label mapping ─────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  schedule_created: 'לוח שיבוץ נוצר',
  schedule_generated: 'לוח שיבוץ הופק',
  schedule_regenerated: 'לוח שיבוץ הופק מחדש',
  schedule_published: 'לוח שיבוץ פורסם',
  schedule_updated: 'לוח שיבוץ עודכן',
  schedule_deleted: 'לוח שיבוץ נמחק',
  constraint_override: 'עקיפת אילוץ',
  constraint_exception_consumed: 'חריגת אילוץ מומשה',
  user_created: 'משתמש נוצר',
  user_updated: 'משתמש עודכן',
  shift_created: 'משמרת נוצרה',
};

type AuditType = 'publish' | 'override' | 'user' | 'edit';

function actionToType(action: string): AuditType {
  if (action.includes('publish')) return 'publish';
  if (action.includes('override') || action.includes('exception')) return 'override';
  if (action.includes('user')) return 'user';
  return 'edit';
}

const AUDIT_COLORS: Record<AuditType, string> = {
  publish: '#10b981',
  override: '#f59e0b',
  user: '#3b82f6',
  edit: '#8b5cf6',
};
const AUDIT_ICONS: Record<AuditType, string> = {
  publish: 'check',
  override: 'warning',
  user: 'group',
  edit: 'settings',
};

// ─── Shift card ───────────────────────────────────────────────────────────────

type DashboardShift = AdminDashboardDTO['shifts'][number];
type DashboardAssignment = AdminDashboardDTO['assignments'][number];
type DashboardEmployee = AdminDashboardDTO['employees'][number];
type DashboardAuditLog = AdminDashboardDTO['auditLogs'][number];

// ─── Shift overview ───────────────────────────────────────────────────────────

function ShiftOverview({
  employees,
  shifts,
  assignments,
}: {
  employees: DashboardEmployee[];
  shifts: DashboardShift[];
  assignments: DashboardAssignment[];
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const curIdx = getCurrentShiftIndex(now);
  const prevIdx = (curIdx + 2) % 3;
  const nextIdx = (curIdx + 1) % 3;

  const todayDay = WEEK_DAY_KEYS[now.getDay()];

  function getShiftData(defIdx: number) {
    const shiftDef = SHIFTS[defIdx];
    if (!shiftDef) return { staff: [], requiredCount: 0, shift: undefined };

    const todayShift = shifts.find((s) => {
      return normalizeShiftDay(s.day) === todayDay && s.type === shiftDef.id;
    });

    if (!todayShift) return { staff: [], requiredCount: 0, shift: undefined };

    const shiftAssignments = assignments.filter((a) => a.shiftId === todayShift.id);
    const staff: StaffEntry[] = shiftAssignments.map((a) => {
      const user = employees.find((u) => u.id === a.employeeId);
      return {
        id: a.id,
        name: user?.name ?? 'עובד לא ידוע',
        isFixed: user?.isFixedMorningEmployee ?? false,
      };
    });

    return { staff, requiredCount: todayShift.requiredEmployees, shift: todayShift };
  }

  const prevData = getShiftData(prevIdx);
  const curData = getShiftData(curIdx);
  const nextData = getShiftData(nextIdx);

  return (
    <section className="flex flex-col gap-md">
      <h2 className="text-xl font-bold text-[#010636] border-r-4 border-[#056AE5] pr-3">
        סטטוס משמרות
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <ShiftCard
          shift={SHIFTS[prevIdx]}
          instance={prevData.shift}
          staff={prevData.staff}
          requiredCount={prevData.requiredCount}
          type="prev"
        />
        <ShiftCard
          shift={SHIFTS[curIdx]}
          instance={curData.shift}
          staff={curData.staff}
          requiredCount={curData.requiredCount}
          type="current"
        />
        <ShiftCard
          shift={SHIFTS[nextIdx]}
          instance={nextData.shift}
          staff={nextData.staff}
          requiredCount={nextData.requiredCount}
          type="next"
        />
      </div>
    </section>
  );
}

// ─── Broadcast center ─────────────────────────────────────────────────────────

function BroadcastCenter({
  recipientCount,
  onToast,
}: {
  recipientCount: number;
  onToast: (t: Toast) => void;
}) {
  const [msg, setMsg] = useState('');
  const [broadcastId, setBroadcastId] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!broadcastId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await notificationApi.getBroadcastStatus(broadcastId);
        setRecipients(res.recipients);
      } catch {
        // ignore poll errors
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [broadcastId]);

  async function handleSend() {
    if (!msg.trim()) return;
    try {
      const res = await notificationApi.broadcast('הודעה לצוות', msg.trim());
      setBroadcastId(res.broadcastId);
      const statusRes = await notificationApi.getBroadcastStatus(res.broadcastId);
      setRecipients(statusRes.recipients);
      onToast({ message: 'הודעה הופצה לכל הצוות', type: 'success' });
      setMsg('');
    } catch (err) {
      onToast({
        message: err instanceof Error ? err.message : 'שגיאה בשליחת הודעה',
        type: 'error',
      });
    }
  }

  function handleReset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setBroadcastId(null);
    setRecipients([]);
  }

  const readCount = recipients.filter((r) => r.isRead).length;

  return (
    <section className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-md">
        <h2 className="text-xl font-bold text-[#010636] border-r-4 border-[#056AE5] pr-3">
          הודעות לצוות
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-medium">
          <MaterialIcon name="group" className="text-secondary text-[14px]" />
          <span>{recipientCount} נמענים</span>
        </div>
      </div>

      <div className="flex-1 bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm flex flex-col">
        {!broadcastId ? (
          <>
            <div className="flex items-center gap-2 mb-sm text-[10px] font-bold text-on-surface-variant uppercase">
              <MaterialIcon name="notifications" className="text-secondary text-[14px]" />
              <span>שידור הודעה חדשה</span>
            </div>

            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="הכנס עדכונים חשובים, הודעות ביקורת, או הוראות כלליות לכל הצוות..."
              className="w-full flex-1 min-h-[120px] rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[rgba(43,53,143,0.1)] focus:border-[#2B358F] transition-all bg-white border border-[#e2e8f0] text-on-surface"
              style={{ direction: 'rtl' }}
            />

            <div className="flex items-center justify-between mt-md">
              <span className="text-xs text-on-surface-variant font-medium opacity-70">
                {msg.length > 0 ? `${msg.length} תווים` : 'תומך Markdown'}
              </span>
              <button
                onClick={handleSend}
                disabled={!msg.trim()}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-sm ${
                  msg.trim()
                    ? 'bg-[#056AE5] text-white hover:bg-[#0457B8] hover:shadow-md'
                    : 'bg-surface-container text-on-surface-variant/40 cursor-not-allowed'
                }`}
              >
                <MaterialIcon name="send" className="text-[14px]" />
                שלח לכולם
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col h-full">
            <div className="rounded-lg px-4 py-3 mb-md bg-green-50 border border-green-200">
              <div className="flex items-center justify-between mb-sm">
                <div className="flex items-center gap-2">
                  <MaterialIcon name="check" className="text-green-600 text-[16px]" />
                  <span className="text-sm font-bold text-green-800">ההודעה נשלחה!</span>
                </div>
                <span className="text-xs font-bold text-green-700">
                  {readCount}/{recipients.length} קראו
                </span>
              </div>
              <div className="h-2 rounded-full bg-green-100 overflow-hidden">
                <div
                  className="h-full transition-all duration-700 bg-green-500"
                  style={{
                    width: recipients.length ? `${(readCount / recipients.length) * 100}%` : '0%',
                  }}
                />
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-auto pr-1 mb-md">
              {recipients.map((r, i) => (
                <div
                  key={r.userId}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/30"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ background: avatarBg(i) }}
                  >
                    {avatarInitials(r.name)}
                  </div>
                  <span className="flex-1 text-sm font-medium text-on-surface">{r.name}</span>
                  {r.isRead ? (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100">
                      <MaterialIcon name="check" className="text-[10px]" /> נקרא
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-on-surface-variant opacity-60 bg-surface-container px-2 py-0.5 rounded border border-outline-variant/20">
                      <MaterialIcon name="schedule" className="text-[10px]" /> ממתין
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-md border-t border-outline-variant/20 mt-auto">
              <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                מתרענן כל 5 שניות
              </div>
              <button
                onClick={handleReset}
                className="text-xs font-bold px-4 py-2 rounded-lg transition-all bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              >
                הודעה חדשה
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Audit log widget ─────────────────────────────────────────────────────────

function AuditLogWidget({ logs }: { logs: DashboardAuditLog[] | null }) {
  const loading = logs === null;

  return (
    <section className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-md">
        <h2 className="text-xl font-bold text-[#010636] border-r-4 border-[#056AE5] pr-3">
          פעילות אחרונה
        </h2>
        <button className="text-[12px] text-secondary hover:underline font-bold transition-colors">
          צפה בהכל
        </button>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden shadow-bezeq-card">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-md py-3 ${i < 3 ? 'border-b border-outline-variant/30' : ''}`}
            >
              <div className="w-8 h-8 rounded-lg bg-surface-container animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-2.5 rounded bg-surface-container-high animate-pulse w-3/4" />
                <div className="h-2 rounded bg-surface-container animate-pulse w-1/2" />
              </div>
            </div>
          ))
        ) : logs.length === 0 ? (
          <div className="px-md py-lg text-sm text-center text-on-surface-variant">
            אין פעילות עדיין
          </div>
        ) : (
          logs.map((entry, i) => {
            const type = actionToType(entry.action);
            const label = ACTION_LABELS[entry.action] ?? entry.action;
            const performer = 'מערכת';
            const timeStr = new Date(entry.createdAt).toLocaleTimeString('he-IL', {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div
                key={entry.id}
                className={`flex items-center gap-3 px-md py-3 hover:bg-surface-container-low transition-colors ${i < logs.length - 1 ? 'border-b border-outline-variant/30' : ''}`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `${AUDIT_COLORS[type]}15`,
                    border: `1px solid ${AUDIT_COLORS[type]}30`,
                  }}
                >
                  <MaterialIcon
                    name={AUDIT_ICONS[type]}
                    className="text-[14px]"
                    style={{ color: AUDIT_COLORS[type] }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate text-on-surface">{label}</div>
                  <div className="text-[10px] truncate text-on-surface-variant opacity-70">
                    {performer}
                  </div>
                </div>
                <span className="text-[10px] font-medium flex-shrink-0 text-on-surface-variant">
                  {timeStr}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { weekId: paramWeekId } = useParams<{ weekId: string }>();
  const [toast, setToast] = useState<Toast | null>(null);

  const weekId = paramWeekId || getCurrentWeekId();
  const weekNumber = parseWeekNumber(weekId);
  const { dashboard, loading, error, actions, generateResult, clearGenerateResult, actionLoading } =
    useAdminDashboard(weekId);
  const employees = (dashboard?.employees ?? []).filter((u) => u.isActive);
  const scheduleStats = dashboard ? getScheduleStats(dashboard) : null;

  return (
    <MainLayout title="דאשבורד מנהל" subtitle={`שבוע ${weekNumber}`}>
      <div className="space-y-6">
        {/* Quick Actions at the top */}
        <QuickActionsPanel
          weekId={weekId}
          onToast={setToast}
          onGenerate={actions.generateSchedule}
          isGenerating={actionLoading.generating}
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
            <ShiftOverview
              employees={employees}
              shifts={dashboard?.shifts ?? []}
              assignments={dashboard?.assignments ?? []}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <BroadcastCenter recipientCount={employees.length} onToast={setToast} />
              <MissingConstraintsPanel missingUsers={dashboard?.missingConstraints ?? null} />
            </div>
          </div>

          {/* Side content column */}
          <div className="xl:col-span-1 space-y-6">
            <DashboardSummaryPanel
              weekNumber={weekNumber}
              totalUsers={employees.length}
              stats={scheduleStats}
            />
            <AuditLogWidget logs={dashboard?.auditLogs ?? null} />
          </div>
        </div>
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
