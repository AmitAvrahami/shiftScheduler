import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import { notificationApi, scheduleApi } from '../lib/api';
import type { BroadcastRecipient, GenerateResult } from '../lib/api';
import { useAdminDashboard } from './admin/hooks/useAdminDashboard';
import type { AdminDashboardDTO, ShiftType, WeekWorkflowState } from './admin/types';
import { normalizeShiftDay, type WeekDayKey } from './admin/utils/scheduleBoardUtils';

// ─── Week utilities ───────────────────────────────────────────────────────────

const IST_OFFSET_MS = 3 * 60 * 60 * 1000;

function getCurrentWeekId(): string {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const thursday = new Date(Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}


function parseWeekNumber(weekId: string): number {
  return parseInt(weekId.split('-W')[1], 10);
}

// ─── Shift definitions ────────────────────────────────────────────────────────

interface ShiftDef {
  id: Exclude<ShiftType, 'unknown'>;
  label: string;
  start: string;
  end: string;
  color: string;
  dimBg: string;
  icon: string;
}

// UI display config only — labels, colors, icons, display times.
// Shift counts, assignments, and required employees come from dashboard.shifts.
// TODO: future dynamic shift definitions should come from the ShiftDefinition API;
//       remove this static list when the backend exposes shift metadata per week.
const SHIFTS: ShiftDef[] = [
  { id: 'morning',   label: 'בוקר',  start: '06:45', end: '14:45', color: '#f59e0b', dimBg: 'rgba(245,158,11,0.15)',  icon: 'wb_sunny'    },
  { id: 'afternoon', label: 'אחה"צ', start: '14:45', end: '22:45', color: '#8b5cf6', dimBg: 'rgba(139,92,246,0.15)', icon: 'light_mode' },
  { id: 'night',     label: 'לילה',  start: '22:45', end: '06:45', color: '#06b6d4', dimBg: 'rgba(6,182,212,0.15)',  icon: 'dark_mode'   },
];

const WEEK_DAY_KEYS: WeekDayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getCurrentShiftIndex(now: Date): number {
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= 6 * 60 + 45 && mins < 14 * 60 + 45) return 0;
  if (mins >= 14 * 60 + 45 && mins < 22 * 60 + 45) return 1;
  return 2;
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
}

function avatarBg(idx: number): string {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
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
  publish: '#10b981', override: '#f59e0b', user: '#3b82f6', edit: '#8b5cf6',
};
const AUDIT_ICONS: Record<AuditType, string> = {
  publish: 'check', override: 'warning', user: 'group', edit: 'settings',
};

// ─── Shift card ───────────────────────────────────────────────────────────────

interface StaffEntry {
  id: string;
  name: string;
  isFixed: boolean;
}

type DashboardShift = AdminDashboardDTO['shifts'][number];
type DashboardAssignment = AdminDashboardDTO['assignments'][number];
type DashboardEmployee = AdminDashboardDTO['employees'][number];
type DashboardAuditLog = AdminDashboardDTO['auditLogs'][number];
type MissingConstraintUser = AdminDashboardDTO['missingConstraints'][number];

function ShiftCard({
  shift,
  instance,
  staff,
  requiredCount,
  type,
}: {
  shift: ShiftDef;
  instance?: DashboardShift;
  staff: StaffEntry[];
  requiredCount: number;
  type: 'prev' | 'current' | 'next';
}) {
  const isCurrent = type === 'current';
  const isPrev    = type === 'prev';
  const isNext    = type === 'next';

  const emptySlotsCount = Math.max(0, requiredCount - staff.length);
  const timeLabel = `${shift.start} - ${shift.end}`;

  if (isCurrent) {
    return (
      <div
        className="text-white rounded-xl p-md flex flex-col gap-sm relative overflow-hidden h-full"
        style={{ background: 'linear-gradient(135deg, #010636 0%, #2B358F 100%)', boxShadow: 'rgba(61, 83, 222, 0.35) 0px 8px 24px 0px' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
        <div className="flex justify-between items-center text-[10px] font-bold opacity-90 relative z-10">
          <span style={{ direction: 'ltr' }}>{timeLabel}</span>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>פעיל</span>
          </div>
        </div>
        {instance && (
          <span className="relative z-10 inline-flex w-fit items-center px-2 py-0.5 rounded-full border text-[10px] font-bold bg-emerald-100 text-emerald-800 border-emerald-200">
            מוגדרת
          </span>
        )}
        <h3 className="text-lg font-bold text-white relative z-10">משמרת נוכחית</h3>
        <p className="text-sm opacity-90 relative z-10">{shift.label}</p>
        <div className="mt-auto pt-sm relative z-10 flex items-center justify-between">
          <span className="text-xs font-medium">{staff.length}/{requiredCount} עובדים</span>
          <div className="flex -space-x-1.5 space-x-reverse">
            {staff.map((s, i) => (
              <div key={s.id} className="w-5 h-5 rounded-full ring-1 ring-white/30 bg-white/10 flex items-center justify-center text-[7px] font-bold" style={{ background: avatarBg(i) }}>
                {avatarInitials(s.name)}
              </div>
            ))}
            {Array.from({ length: emptySlotsCount }).map((_, i) => (
               <div key={i} className="w-5 h-5 rounded-full ring-1 ring-dashed ring-white/50 bg-white/5 flex items-center justify-center">
                 <MaterialIcon name="add" className="text-[10px] text-white/50" />
               </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white border border-[#e2e8f0] rounded-xl p-md flex flex-col gap-sm h-full ${isPrev ? 'opacity-70' : 'hover:shadow-md transition-shadow shadow-bezeq-card'}`}
    >
      <div className={`flex justify-between items-center text-[10px] font-bold ${isNext ? 'text-[#056AE5]' : 'text-on-surface-variant'}`}>
        <span style={{ direction: 'ltr' }}>{timeLabel}</span>
        <MaterialIcon name={isPrev ? 'history' : 'calendar_today'} className="text-[16px]" />
      </div>
      {instance && (
        <span className="inline-flex w-fit items-center px-2 py-0.5 rounded-full border text-[10px] font-bold bg-emerald-100 text-emerald-800 border-emerald-200">
          מוגדרת
        </span>
      )}
      <h3 className="text-lg font-bold text-on-surface">{isPrev ? 'משמרת קודמת' : 'משמרת הבאה'}</h3>
      <p className="text-sm text-on-surface-variant">{shift.label}</p>
      <div className="mt-auto pt-sm flex items-center justify-between">
        <div className="flex -space-x-2 space-x-reverse">
          {staff.length === 0 && emptySlotsCount === 0 ? (
            <span className="text-[10px] text-on-surface-variant opacity-50">אין משובצים</span>
          ) : (
            <>
              {staff.map((s, i) => (
                <div
                  key={s.id}
                  className="inline-block h-6 w-6 rounded-full ring-2 ring-white overflow-hidden bg-surface-container-high"
                  title={s.name}
                >
                  <div
                    className="w-full h-full flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ background: avatarBg(i) }}
                  >
                    {avatarInitials(s.name)}
                  </div>
                </div>
              ))}
              {Array.from({ length: emptySlotsCount }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center"
                  title="הוספת עובד"
                >
                  <MaterialIcon name="add" className="text-[12px] text-slate-400" />
                </div>
              ))}
            </>
          )}
        </div>
        {isNext && staff.length < requiredCount && (
          <span className="text-[10px] font-bold text-error bg-error-container text-on-error-container px-2 py-1 rounded">חסר עובד</span>
        )}
      </div>
    </div>
  );
}

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

  const curIdx  = getCurrentShiftIndex(now);
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
    const staff = shiftAssignments.map((a) => {
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
  const curData  = getShiftData(curIdx);
  const nextData = getShiftData(nextIdx);

  return (
    <section className="flex flex-col gap-md">
      <h2 className="text-xl font-bold text-[#010636] border-r-4 border-[#056AE5] pr-3">סטטוס משמרות</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <ShiftCard shift={SHIFTS[prevIdx]} instance={prevData.shift} staff={prevData.staff} requiredCount={prevData.requiredCount} type="prev" />
        <ShiftCard shift={SHIFTS[curIdx]}  instance={curData.shift}  staff={curData.staff}  requiredCount={curData.requiredCount}  type="current" />
        <ShiftCard shift={SHIFTS[nextIdx]} instance={nextData.shift} staff={nextData.staff} requiredCount={nextData.requiredCount} type="next" />
      </div>
    </section>
  );
}


// ─── Missing constraints ──────────────────────────────────────────────────────

function MissingConstraints({ missingUsers }: { missingUsers: MissingConstraintUser[] | null }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [reminded, setReminded]   = useState<string[]>([]);
  const visible = (missingUsers ?? []).filter(u => !dismissed.includes(u.id));

  function handleRemind(id: string) {
    setReminded(r => [...r, id]);
    setTimeout(() => setReminded(r => r.filter(x => x !== id)), 2000);
  }

  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between mb-md">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-[#010636] border-r-4 border-[#056AE5] pr-3">
            אילוצים חסרים
          </h2>
          {visible.length > 0 && (
            <span
              className="flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full text-xs font-bold bg-error-container text-on-error-container animate-pulse"
            >
              {visible.length}
            </span>
          )}
        </div>
        <span className="text-[10px] text-on-surface-variant font-medium">דדליין: שני 23:59 IST</span>
      </div>

      <div className="flex-1">
        {missingUsers === null ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-container animate-pulse" />
            <span className="text-xs text-on-surface-variant">טוען נתונים...</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex items-center gap-3 shadow-sm">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-50">
              <MaterialIcon name="check" className="text-green-600 text-[16px]" />
            </div>
            <span className="text-xs text-on-surface-variant">כל הצוות הגיש אילוצים לשבוע הבא.</span>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
            <div className="bg-surface-container-high px-md py-sm flex justify-between text-[10px] font-bold text-on-surface-variant">
              <span>שם העובד</span>
              <span>פעולות</span>
            </div>
            <div className="divide-y divide-outline-variant">
              {visible.map((u, i) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 px-md py-md transition-colors hover:bg-surface-container-low"
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: avatarBg(i) }}
                  >
                    {avatarInitials(u.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-on-surface font-semibold truncate">{u.name}</span>
                      <MaterialIcon name="error" className="text-error text-[14px]" />
                    </div>
                    <span className="text-xs text-on-surface-variant">עובד</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRemind(u.id)}
                      className={`text-[12px] px-4 py-2 rounded-full transition-all border font-bold ${
                        reminded.includes(u.id)
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-[#056AE5] text-white border-[#056AE5] hover:bg-[#0457B8]'
                      }`}
                    >
                      {reminded.includes(u.id) ? 'נשלח!' : 'תזכורת'}
                    </button>
                    <button
                      onClick={() => setDismissed(d => [...d, u.id])}
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-surface-container text-on-surface-variant"
                    >
                      <MaterialIcon name="close" className="text-[16px]" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Broadcast center ─────────────────────────────────────────────────────────

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

function BroadcastCenter({
  recipientCount,
  onToast,
}: {
  recipientCount: number;
  onToast: (t: Toast) => void;
}) {
  const [msg, setMsg]           = useState('');
  const [broadcastId, setBroadcastId] = useState<string | null>(null);
  const [recipients, setRecipients]   = useState<BroadcastRecipient[]>([]);
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
      onToast({ message: err instanceof Error ? err.message : 'שגיאה בשליחת הודעה', type: 'error' });
    }
  }

  function handleReset() {
    if (pollRef.current) clearInterval(pollRef.current);
    setBroadcastId(null);
    setRecipients([]);
  }

  const readCount = recipients.filter(r => r.isRead).length;

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
              onChange={e => setMsg(e.target.value)}
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
                  msg.trim() ? 'bg-[#056AE5] text-white hover:bg-[#0457B8] hover:shadow-md' : 'bg-surface-container text-on-surface-variant/40 cursor-not-allowed'
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
                  {r.isRead
                    ? <div className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100"><MaterialIcon name="check" className="text-[10px]" /> נקרא</div>
                    : <div className="flex items-center gap-1 text-[10px] font-bold text-on-surface-variant opacity-60 bg-surface-container px-2 py-0.5 rounded border border-outline-variant/20"><MaterialIcon name="schedule" className="text-[10px]" /> ממתין</div>
                  }
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

// ─── Generated schedule panel ─────────────────────────────────────────────────

function GeneratedSchedulePanel({
  result,
  onClose,
}: {
  result: GenerateResult | null;
  onClose: () => void;
}) {
  if (!result) return null;

  const statusColor =
    result.status === 'OPTIMAL'  ? '#10b981' :
    result.status === 'FEASIBLE' ? '#f59e0b' :
    result.status === 'RELAXED'  ? '#f97316' : '#ef4444';

  const statusBg =
    result.status === 'OPTIMAL'  ? 'rgba(16,185,129,0.1)' :
    result.status === 'FEASIBLE' ? 'rgba(245,158,11,0.1)' :
    result.status === 'RELAXED'  ? 'rgba(249,115,22,0.1)' : 'rgba(239,68,68,0.1)';

  const statusLabel =
    result.status === 'OPTIMAL'  ? 'אופטימלי' :
    result.status === 'FEASIBLE' ? 'ישים' :
    result.status === 'RELAXED'  ? 'מרופה' : result.status;

  return (
    <div
      className="rounded-2xl p-5 mb-6 shadow-sm bg-white"
      style={{ border: `1px solid ${statusColor}40` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: statusBg }}>
            <MaterialIcon name="bolt" className="text-[16px]" style={{ color: statusColor }} />
          </div>
          <span className="text-sm font-bold text-slate-800">תוצאות הפקת לוח שיבוץ</span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
            style={{ background: statusBg, color: statusColor, borderColor: `${statusColor}30` }}
          >
            {statusLabel}
          </span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors bg-slate-50 hover:bg-slate-100 p-1.5 rounded-md">
          <MaterialIcon name="close" className="text-[16px]" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl p-3 border border-slate-100 bg-slate-50">
          <div className="text-xl font-bold mb-0.5" style={{ color: statusColor }}>
            {result.assignmentCount}
          </div>
          <div className="text-xs text-slate-500 font-medium">שיבוצים</div>
        </div>
        <div className="rounded-xl p-3 border border-slate-100 bg-slate-50">
          <div className="text-xl font-bold mb-0.5 text-slate-700">
            {(result.solveTimeMs / 1000).toFixed(2)}s
          </div>
          <div className="text-xs text-slate-500 font-medium">זמן פתרון</div>
        </div>
        <div className="rounded-xl p-3 border border-slate-100 bg-slate-50">
          <div className="text-xl font-bold mb-0.5" style={{ color: result.warnings.length ? '#f59e0b' : '#10b981' }}>
            {result.warnings.length}
          </div>
          <div className="text-xs text-slate-500 font-medium">אזהרות</div>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="rounded-xl px-4 py-3 mb-3 bg-amber-50 border border-amber-200">
          <div className="text-xs font-bold mb-2 flex items-center gap-1.5 text-amber-700">
            <MaterialIcon name="warning" className="text-[12px]" />
            אזהרות
          </div>
          <div className="space-y-1.5">
            {result.warnings.map((w, i) => (
              <div key={i} className="text-xs text-amber-800 flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.violations.length > 0 && (
        <div className="rounded-xl px-4 py-3 bg-red-50 border border-red-200">
          <div className="text-xs font-bold mb-2 flex items-center gap-1.5 text-red-700">
            <MaterialIcon name="error" className="text-[12px]" />
            הפרות (מרופה)
          </div>
          <div className="space-y-1.5">
            {result.violations.map((v, i) => (
              <div key={i} className="text-xs text-red-800 flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>{v.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Quick actions ────────────────────────────────────────────────────────────

function QuickActions({
  weekId,
  onToast,
  onGenerateResult,
  onRefresh,
}: {
  weekId: string;
  onToast: (t: Toast) => void;
  onGenerateResult: (r: GenerateResult) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      // Temporary compatibility layer: keep the legacy result panel until generation UI is moved into useAdminDashboard.
      const result = await scheduleApi.generate(weekId);
      onGenerateResult(result);
      await onRefresh();
      onToast({ message: 'לוח שיבוץ הופק בהצלחה!', type: 'success' });
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : 'שגיאה בהפקת לוח שיבוץ', type: 'error' });
    } finally {
      setGenerating(false);
    }
  }

  const actions = [
    { id: 'generate',  label: 'ייצור סידור עבודה', icon: 'bolt', onClick: handleGenerate, subtitle: 'אוטומציה מלאה',   isPrimary: true  },
    { id: 'view_week', label: 'צפייה בסידור השבועי', icon: 'calendar_view_week', onClick: () => navigate(`/schedules/${weekId}`), subtitle: 'לוח שיבוץ מלא', isPrimary: false },
    { id: 'leaves',    label: 'אישור חופשות',       icon: 'check',    onClick: () => onToast({ message: 'אישור חופשות (בקרוב)', type: 'info' }), subtitle: 'ניהול היעדרויות', isPrimary: false },
    { id: 'emergency', label: 'משמרת חירום',        icon: 'warning',    onClick: () => onToast({ message: 'הוספת משמרת חירום (בקרוב)', type: 'info' }), subtitle: 'שיבוץ דחוף',       isPrimary: false },
  ];

  return (
    <section className="flex flex-col w-full">
      <div className="flex items-center justify-between mb-md">
        <h2 className="text-xl font-bold text-[#010636] border-r-4 border-[#056AE5] pr-3">
          פעולות מהירות
        </h2>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-lg p-md shadow-bezeq-card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {actions.map(a => {
            const isGenerate  = a.id === 'generate';
            const isEmergency = a.id === 'emergency';
            const isLoading   = isGenerate && generating;

            return (
              <button
                key={a.id}
                onClick={a.onClick}
                disabled={isLoading}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all border font-bold min-h-[56px] ${
                  isLoading
                    ? 'bg-[#056AE5]/80 text-white border-transparent cursor-wait'
                    : isGenerate
                    ? 'bg-[#056AE5] text-white border-transparent hover:bg-[#0457B8] shadow-md'
                    : isEmergency
                    ? 'bg-white text-error border-error/40 hover:bg-error/5 hover:border-error'
                    : 'bg-white text-[#2B358F] border-[#e2e8f0] hover:bg-[#F1F8FF] hover:border-[#056AE5]'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  isLoading || isGenerate
                    ? 'bg-white/20 text-white'
                    : isEmergency
                    ? 'bg-error/10 text-error'
                    : 'bg-[#056AE5]/10 text-[#056AE5]'
                }`}>
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <MaterialIcon name={a.icon} className="text-[18px]" />
                  )}
                </div>
                <div className="flex flex-col items-start text-right overflow-hidden">
                  <span className="text-sm font-bold whitespace-nowrap">
                    {isLoading ? 'מעבד...' : a.label}
                  </span>
                  <span className={`text-[10px] font-medium opacity-70 ${isGenerate && !isLoading ? 'text-white' : 'text-on-surface-variant'}`}>
                    {a.subtitle}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
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
        <button className="text-[12px] text-secondary hover:underline font-bold transition-colors">צפה בהכל</button>
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
          <div className="px-md py-lg text-sm text-center text-on-surface-variant">אין פעילות עדיין</div>
        ) : (
          logs.map((entry, i) => {
            const type = actionToType(entry.action);
            const label = ACTION_LABELS[entry.action] ?? entry.action;
            const performer = 'מערכת';
            const timeStr = new Date(entry.createdAt).toLocaleTimeString('he-IL', {
              hour: '2-digit', minute: '2-digit',
            });
            return (
              <div
                key={entry.id}
                className={`flex items-center gap-3 px-md py-3 hover:bg-surface-container-low transition-colors ${i < logs.length - 1 ? 'border-b border-outline-variant/30' : ''}`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${AUDIT_COLORS[type]}15`, border: `1px solid ${AUDIT_COLORS[type]}30` }}
                >
                  <MaterialIcon name={AUDIT_ICONS[type]} className="text-[14px]" style={{ color: AUDIT_COLORS[type] }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate text-on-surface">{label}</div>
                  <div className="text-[10px] truncate text-on-surface-variant opacity-70">{performer}</div>
                </div>
                <span className="text-[10px] font-medium flex-shrink-0 text-on-surface-variant">{timeStr}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

// ─── Sidebar Stats ──────────────────────────────────────────────────────────

interface ScheduleStats {
  total: number;
  filled: number;
  partial: number;
  empty: number;
  scheduleStatus: WeekWorkflowState | null;
}

function SidebarStats({
  weekId,
  totalUsers,
  stats,
}: {
  weekId: string;
  totalUsers: number;
  stats: ScheduleStats | null;
}) {
  const STATS = [
    { label: 'סה״כ משמרות', value: stats ? String(stats.total)   : '-', color: '#056AE5' },
    { label: 'מלאות',        value: stats ? String(stats.filled)  : '-', color: '#10b981' },
    { label: 'חלקיות',       value: stats ? String(stats.partial) : '-', color: '#f59e0b' },
    { label: 'ריקות',        value: stats ? String(stats.empty)   : '-', color: '#ef4444' },
  ];

  const weekNum = parseWeekNumber(weekId);
  const scheduleStatusLabel =
    stats?.scheduleStatus === 'published' ? 'פורסם' :
    stats?.scheduleStatus === 'draft'     ? 'טיוטה' :
    stats?.scheduleStatus === 'archived'  ? 'ארכיון' : 'לא נוצר';
  const scheduleStatusOk = stats?.scheduleStatus === 'published';

  return (
    <div className="space-y-3">
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-bezeq-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            סטטיסטיקות שבועיות
          </span>
          <MaterialIcon name="calendar_today" className="text-[13px] text-slate-700" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {STATS.map(s => (
            <div key={s.label} className="rounded-xl p-3 bg-slate-50 border border-slate-100">
              <div className="text-xl font-bold mb-0.5" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] text-slate-600 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 shadow-bezeq-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            סטטוס מערכת
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <div className="space-y-2">
          {[
            { label: 'מנוע CSP',    status: 'פעיל',              ok: true              },
            { label: 'לוח שיבוץ',  status: scheduleStatusLabel,  ok: scheduleStatusOk  },
            { label: 'עובדים',      status: `${totalUsers} פעילים`, ok: true            },
            { label: 'שבוע',        status: `שבוע ${weekNum}`,    ok: null              },
            { label: 'דדליין',      status: 'שני 23:59',          ok: null              },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{item.label}</span>
              <span
                className="text-xs font-bold"
                style={{ color: item.ok === true ? '#056AE5' : item.ok === false ? '#f87171' : '#94a3b8' }}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getScheduleStats(dashboard: AdminDashboardDTO): ScheduleStats {
  const assignmentsByShiftId = new Map<string, number>();
  dashboard.assignments.forEach((assignment) => {
    assignmentsByShiftId.set(assignment.shiftId, (assignmentsByShiftId.get(assignment.shiftId) ?? 0) + 1);
  });

  let partial = 0;
  let empty = 0;

  dashboard.shifts.forEach((shift) => {
    const assignedCount = assignmentsByShiftId.get(shift.id) ?? 0;
    if (assignedCount === 0) {
      empty += 1;
    } else if (assignedCount < Math.max(0, shift.requiredEmployees)) {
      partial += 1;
    }
  });

  return {
    total: dashboard.kpis.totalShifts,
    filled: dashboard.kpis.filledShifts,
    partial,
    empty,
    scheduleStatus: dashboard.scheduleStatus,
  };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const { weekId: paramWeekId } = useParams<{ weekId: string }>();
  const [toast, setToast]                           = useState<Toast | null>(null);
  const [generateResult, setGenerateResult]         = useState<GenerateResult | null>(null);

  const weekId    = paramWeekId || getCurrentWeekId();
  const { dashboard, loading, error, refresh } = useAdminDashboard(weekId);
  const employees = (dashboard?.employees ?? []).filter(u => u.isActive);
  const scheduleStats = dashboard ? getScheduleStats(dashboard) : null;

  return (
    <MainLayout
      title="דאשבורד מנהל"
      subtitle={`שבוע ${parseWeekNumber(weekId)}`}
    >
      <div className="space-y-6">
        {/* Quick Actions at the top */}
        <QuickActions weekId={weekId} onToast={setToast} onGenerateResult={setGenerateResult} onRefresh={refresh} />
        
        {generateResult && (
          <GeneratedSchedulePanel result={generateResult} onClose={() => setGenerateResult(null)} />
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
                <MissingConstraints missingUsers={dashboard?.missingConstraints ?? null} />
            </div>
          </div>
          
          {/* Side content column */}
          <div className="xl:col-span-1 space-y-6">
            <SidebarStats weekId={weekId} totalUsers={employees.length} stats={scheduleStats} />
            <AuditLogWidget logs={dashboard?.auditLogs ?? null} />
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 transition-all ${
            toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
            toast.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
            'bg-blue-50 text-blue-700 border border-blue-200'
          }`}
        >
          <MaterialIcon name={toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info'} />
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-50 hover:opacity-100">
            <MaterialIcon name="close" className="text-[16px]" />
          </button>
        </div>
      )}
    </MainLayout>
  );
}
