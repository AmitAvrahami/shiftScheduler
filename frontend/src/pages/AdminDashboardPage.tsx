import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  userApi,
  constraintApi,
  scheduleApi,
  shiftApi,
  assignmentApi,
  auditLogApi,
  notificationApi,
  shiftDefinitionApi,
} from '../lib/api';
import type {
  Schedule,
  Shift,
  Assignment,
  AuditLogEntry,
  BroadcastRecipient,
  GenerateResult,
} from '../lib/api';
import type { User } from '../types/auth';
import type { ShiftDefinition, ConstraintEntry } from '../types/constraint';

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

function getNextWeekId(weekId: string): string {
  const [yearStr, weekStr] = weekId.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = jan4.getTime() - (jan4Day - 1) * 86_400_000;
  const monday = new Date(week1Monday + (week - 1) * 7 * 86_400_000);
  const nextMonday = new Date(monday.getTime() + 7 * 86_400_000);
  const thu = new Date(nextMonday.getTime() + 3 * 86_400_000);
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((thu.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
  return `${thu.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function getWeekDates(weekId: string): Date[] {
  const [yearStr, weekStr] = weekId.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = jan4.getTime() - (jan4Day - 1) * 86_400_000;
  const monday = new Date(week1Monday + (week - 1) * 7 * 86_400_000);
  const sundayMs = monday.getTime() - 86_400_000;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sundayMs + i * 86_400_000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  });
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseWeekNumber(weekId: string): number {
  return parseInt(weekId.split('-W')[1], 10);
}

// ─── Shift definitions ────────────────────────────────────────────────────────

interface ShiftDef {
  id: string;
  label: string;
  start: string;
  end: string;
  color: string;
  dimBg: string;
  icon: IconName;
}

const SHIFTS: ShiftDef[] = [
  { id: 'morning',   label: 'בוקר',  start: '06:45', end: '14:45', color: '#f59e0b', dimBg: 'rgba(245,158,11,0.15)',  icon: 'sun'    },
  { id: 'afternoon', label: 'אחה"צ', start: '14:45', end: '22:45', color: '#8b5cf6', dimBg: 'rgba(139,92,246,0.15)', icon: 'sunset' },
  { id: 'night',     label: 'לילה',  start: '22:45', end: '06:45', color: '#06b6d4', dimBg: 'rgba(6,182,212,0.15)',  icon: 'moon'   },
];

function getCurrentShiftIndex(now: Date): number {
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins >= 6 * 60 + 45 && mins < 14 * 60 + 45) return 0;
  if (mins >= 14 * 60 + 45 && mins < 22 * 60 + 45) return 1;
  return 2;
}

function shiftProgress(shiftIdx: number, now: Date): number {
  const [sh, sm] = SHIFTS[shiftIdx].start.split(':').map(Number);
  let elapsed = now.getHours() * 60 + now.getMinutes() - (sh * 60 + sm);
  if (elapsed < 0) elapsed += 1440;
  return Math.min(100, Math.round((elapsed / 480) * 100));
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

// ─── SVG icons ────────────────────────────────────────────────────────────────

type IconName =
  | 'clock' | 'alert' | 'send' | 'calendar' | 'check' | 'plus'
  | 'download' | 'sun' | 'moon' | 'sunset' | 'users' | 'bell'
  | 'settings' | 'log' | 'x' | 'zap' | 'eye' | 'edit';

function Icon({
  name,
  size = 16,
  className = '',
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const paths: Record<IconName, React.ReactNode> = {
    clock:    <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    alert:    <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
    send:     <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
    check:    <polyline points="20 6 9 17 4 12"/>,
    plus:     <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    sun:      <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
    moon:     <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
    sunset:   <><path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"/></>,
    users:    <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    bell:     <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    log:      <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>,
    x:        <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    zap:      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
    eye:      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    edit:     <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {paths[name]}
    </svg>
  );
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
const AUDIT_ICONS: Record<AuditType, IconName> = {
  publish: 'check', override: 'alert', user: 'users', edit: 'settings',
};

// ─── Card style helpers ───────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
};

const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({ weekId }: { weekId: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const DAYS   = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const MONTHS = ['ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳'];
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const dateStr = `יום ${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const isConstraintWindow = now.getDay() === 0;
  const weekNum = parseWeekNumber(weekId);

  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-10 h-10 rounded-xl"
          style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}
        >
          <Icon name="zap" size={18} className="text-blue-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">ShiftScheduler</h1>
          <p className="text-xs font-medium" style={{ color: '#64748b' }}>לוח בקרה מנהל · IST (UTC+3)</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {isConstraintWindow && (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
            חלון הגשת אילוצים פתוח
          </div>
        )}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium"
          style={{ ...cardStyle, color: '#94a3b8' }}
        >
          <Icon name="calendar" size={13} />
          <span className="font-semibold text-white">שבוע {weekNum}</span>
        </div>
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}
        >
          <Icon name="clock" size={14} className="text-blue-400" />
          <span className="text-white font-mono tracking-wider" style={{ direction: 'ltr', display: 'inline-block' }}>
            {time}
          </span>
        </div>
        <div className="text-xs hidden sm:block" style={{ color: '#64748b' }}>{dateStr}</div>
      </div>
    </header>
  );
}

// ─── Shift card ───────────────────────────────────────────────────────────────

interface StaffEntry {
  id: string;
  name: string;
  isFixed: boolean;
}

function ShiftCard({
  shift,
  staff,
  type,
}: {
  shift: ShiftDef;
  staff: StaffEntry[];
  type: 'prev' | 'current' | 'next';
}) {
  const isCurrent = type === 'current';
  const isPrev    = type === 'prev';

  return (
    <div
      className={`relative flex-1 min-w-0 rounded-2xl p-5 ${isCurrent ? 'current-glow' : ''}`}
      style={{
        background: isCurrent
          ? 'linear-gradient(135deg,rgba(59,130,246,0.12),rgba(99,102,241,0.08))'
          : isPrev
          ? 'rgba(255,255,255,0.02)'
          : 'rgba(255,255,255,0.04)',
        border: isCurrent
          ? '1px solid rgba(59,130,246,0.5)'
          : '1px solid rgba(255,255,255,0.07)',
        opacity: isPrev ? 0.6 : 1,
      }}
    >
      {isCurrent && (
        <div
          className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold"
          style={{ background: 'rgba(59,130,246,0.2)', color: '#93c5fd' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
          פעיל
        </div>
      )}
      {isPrev && <div className="absolute top-3 left-3 text-xs font-medium" style={{ color: '#475569' }}>קודם</div>}
      {type === 'next' && <div className="absolute top-3 left-3 text-xs font-medium" style={{ color: '#64748b' }}>הבא</div>}

      <div className="flex items-center gap-2 mb-3 mt-1">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: shift.dimBg, border: `1px solid ${shift.color}30` }}
        >
          <Icon name={shift.icon} size={15} style={{ color: shift.color }} />
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: isPrev ? '#64748b' : shift.color }}>
            {shift.label}
          </div>
          <div
            className="text-xs font-mono"
            style={{ color: '#64748b', direction: 'ltr', display: 'inline-block' }}
          >
            {shift.start} – {shift.end}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {staff.length === 0 ? (
          <div className="text-xs" style={{ color: '#475569' }}>אין עובדים משובצים</div>
        ) : (
          staff.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: avatarBg(i),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}
              >
                {avatarInitials(s.name)}
              </div>
              <span className="text-xs truncate" style={{ color: isPrev ? '#475569' : '#cbd5e1' }}>{s.name}</span>
              {s.isFixed && (
                <span
                  className="text-xs px-1 rounded"
                  style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontSize: 9 }}
                >
                  קבוע
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Shift overview ───────────────────────────────────────────────────────────

function ShiftOverview({
  users,
  weekId,
  definitions,
}: {
  users: User[];
  weekId: string;
  definitions: ShiftDefinition[];
}) {
  const [now, setNow] = useState(new Date());
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!weekId) return;
    scheduleApi.getAll().then((res) => {
      const schedule = res.schedules.find((s) => s.weekId === weekId);
      if (!schedule) return;
      Promise.all([
        shiftApi.getBySchedule(schedule._id),
        assignmentApi.getBySchedule(schedule._id),
      ]).then(([shiftsRes, assignRes]) => {
        setShifts(shiftsRes.shifts);
        setAssignments(assignRes.assignments);
      }).catch(console.error);
    }).catch(console.error);
  }, [weekId]);

  const sortedDefs = [...definitions].sort((a, b) => a.orderNumber - b.orderNumber);
  const employees = users.filter(u => u.isActive);
  const curIdx  = getCurrentShiftIndex(now);
  const prevIdx = (curIdx + 2) % 3;
  const nextIdx = (curIdx + 1) % 3;

  const todayKey = toDateKey(now);

  function staffForShiftDef(defIdx: number): StaffEntry[] {
    const def = sortedDefs[defIdx];
    if (!def) {
      // Fallback to round-robin when no real data
      if (defIdx === 0) return employees.filter(u => u.isFixedMorningEmployee).map(u => ({ id: u._id, name: u.name, isFixed: true }));
      const nonFixed = employees.filter(u => !u.isFixedMorningEmployee);
      if (defIdx === 1) return nonFixed.filter((_, i) => i % 2 === 0).map(u => ({ id: u._id, name: u.name, isFixed: false }));
      return nonFixed.filter((_, i) => i % 2 !== 0).map(u => ({ id: u._id, name: u.name, isFixed: false }));
    }

    // Find today's shift for this definition
    const todayShift = shifts.find((s) => {
      const shiftDateKey = toDateKey(new Date(s.date));
      return shiftDateKey === todayKey && s.definitionId === def._id;
    });

    if (!todayShift) {
      // No shift record today — show empty
      return [];
    }

    // Find assignments for this shift
    const shiftAssignments = assignments.filter((a) => a.shiftId === todayShift._id);
    return shiftAssignments.map((a) => {
      const user = employees.find((u) => u._id === a.userId);
      return {
        id: a._id,
        name: user?.name ?? 'עובד לא ידוע',
        isFixed: user?.isFixedMorningEmployee ?? false,
      };
    });
  }

  const progress = shiftProgress(curIdx, now);

  function userShiftIdx(u: User): number {
    if (u.isFixedMorningEmployee) return 0;
    const nonFixed = employees.filter(e => !e.isFixedMorningEmployee);
    const idx = nonFixed.findIndex(e => e._id === u._id);
    return idx % 2 === 0 ? 1 : 2;
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#cbd5e1' }}>סקירת משמרות</h2>
        <span className="text-xs" style={{ color: '#475569' }}>06:45 · 14:45 · 22:45</span>
      </div>

      <div className="flex gap-3 mb-4">
        <ShiftCard shift={SHIFTS[prevIdx]} staff={staffForShiftDef(prevIdx)} type="prev" />
        <ShiftCard shift={SHIFTS[curIdx]}  staff={staffForShiftDef(curIdx)}  type="current" />
        <ShiftCard shift={SHIFTS[nextIdx]} staff={staffForShiftDef(nextIdx)} type="next" />
      </div>

      {/* Progress bar */}
      <div className="mb-5 rounded-xl px-4 py-3" style={cardStyle}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs" style={{ color: '#64748b' }}>
            התקדמות משמרת — {SHIFTS[curIdx].label}
          </span>
          <span className="text-xs font-semibold text-blue-400">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1e293b' }}>
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)' }}
          />
        </div>
      </div>

      {/* Who's working today */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center gap-2 mb-4">
          <Icon name="users" size={14} style={{ color: '#64748b' }} />
          <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#94a3b8' }}>
            מי עובד היום
          </h3>
          <span
            className="mr-auto text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd' }}
          >
            {employees.length} עובדים
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {employees.map((u, i) => {
            const sIdx  = userShiftIdx(u);
            const shift = SHIFTS[sIdx];
            const isCur = sIdx === curIdx;
            return (
              <div
                key={u._id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
                style={{
                  background: isCur ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.03)',
                  border: isCur ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
                }}
              >
                <div
                  style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: avatarBg(i),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#fff',
                  }}
                >
                  {avatarInitials(u.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: '#e2e8f0' }}>{u.name}</div>
                  <div
                    className="text-xs font-mono"
                    style={{ color: shift.color, direction: 'ltr', display: 'inline-block' }}
                  >
                    {shift.start} – {shift.end}
                  </div>
                </div>
                {isCur && <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />}
              </div>
            );
          })}
          {employees.length === 0 && (
            <div className="col-span-2 text-sm text-center py-4" style={{ color: '#475569' }}>
              אין עובדים פעילים
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Missing constraints ──────────────────────────────────────────────────────

function MissingConstraints({ missingUsers }: { missingUsers: User[] | null }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [reminded, setReminded]   = useState<string[]>([]);
  const visible = (missingUsers ?? []).filter(u => !dismissed.includes(u._id));

  function handleRemind(id: string) {
    setReminded(r => [...r, id]);
    setTimeout(() => setReminded(r => r.filter(x => x !== id)), 2000);
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#cbd5e1' }}>
            אילוצים חסרים
          </h2>
          {visible.length > 0 && (
            <span
              className="flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171' }}
            >
              {visible.length}
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: '#475569' }}>דדליין: שני 23:59 IST</span>
      </div>

      {missingUsers === null ? (
        <div className="rounded-2xl p-6 flex items-center gap-3" style={cardStyle}>
          <span className="text-sm" style={{ color: '#64748b' }}>טוען...</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl p-6 flex items-center gap-3" style={cardStyle}>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(16,185,129,0.15)' }}
          >
            <Icon name="check" size={16} className="text-emerald-400" />
          </div>
          <span className="text-sm" style={{ color: '#94a3b8' }}>כל הצוות הגיש אילוצים.</span>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={cardStyle}>
          <div
            className="px-4 py-3 flex gap-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: '#475569', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
          >
            <span className="flex-1">עובד</span>
            <span className="w-20">פעולה</span>
          </div>
          {visible.map((u, i) => (
            <div
              key={u._id}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]"
              style={{ borderBottom: i < visible.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
            >
              <div
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: avatarBg(i),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}
              >
                {avatarInitials(u.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: '#e2e8f0' }}>{u.name}</span>
                  <Icon name="alert" size={12} className="text-red-400 flex-shrink-0" />
                </div>
                <span className="text-xs" style={{ color: '#475569' }}>
                  {u.role === 'manager' ? 'מנהל' : 'עובד'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRemind(u._id)}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                  style={{
                    background: reminded.includes(u._id) ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)',
                    color:      reminded.includes(u._id) ? '#34d399' : '#93c5fd',
                    border:     reminded.includes(u._id) ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(59,130,246,0.2)',
                  }}
                >
                  {reminded.includes(u._id) ? 'נשלח!' : 'תזכורת'}
                </button>
                <button
                  onClick={() => setDismissed(d => [...d, u._id])}
                  className="w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-white/10"
                  style={{ color: '#475569' }}
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Constraint manager panel ─────────────────────────────────────────────────

function ConstraintManagerPanel({
  users,
  nextWeekId,
  definitions,
  onToast,
}: {
  users: User[];
  nextWeekId: string;
  definitions: ShiftDefinition[];
  onToast: (t: Toast) => void;
}) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editChecked, setEditChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const weekDates = getWeekDates(nextWeekId);
  const employees = users.filter(u => u.role === 'employee' && u.isActive);

  async function openEditor(user: User) {
    setSelectedUser(user);
    setEditChecked({});
    setLoading(true);
    try {
      const res = await constraintApi.getForUser(nextWeekId, user._id);
      if (res.constraint) {
        const initial: Record<string, boolean> = {};
        for (const entry of res.constraint.entries) {
          if (!entry.canWork) {
            initial[`${entry.definitionId}:${entry.date}`] = true;
          }
        }
        setEditChecked(initial);
      }
    } catch {
      // start with empty constraint
    } finally {
      setLoading(false);
    }
  }

  function handleToggle(definitionId: string, dateKey: string) {
    const key = `${definitionId}:${dateKey}`;
    setEditChecked(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next[key]) delete next[key];
      return next;
    });
  }

  async function handleSave() {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const entries: ConstraintEntry[] = Object.entries(editChecked)
        .filter(([, v]) => v)
        .map(([key]) => {
          const [definitionId, date] = key.split(':');
          return { definitionId, date, canWork: false };
        });
      await constraintApi.upsertForUser(nextWeekId, selectedUser._id, entries);
      onToast({ message: `אילוצי ${selectedUser.name} עודכנו`, type: 'success' });
      setSelectedUser(null);
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : 'שגיאה בשמירת האילוצים', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#cbd5e1' }}>
          ניהול אילוצי עובדים
        </h2>
        <span className="text-xs" style={{ color: '#475569' }}>שבוע {parseWeekNumber(nextWeekId)}</span>
      </div>

      <div className="rounded-2xl overflow-hidden" style={cardStyle}>
        {employees.length === 0 ? (
          <div className="px-4 py-6 text-sm text-center" style={{ color: '#475569' }}>אין עובדים פעילים</div>
        ) : (
          employees.map((u, i) => (
            <div
              key={u._id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom: i < employees.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
            >
              <div
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: avatarBg(i),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}
              >
                {avatarInitials(u.name)}
              </div>
              <span className="flex-1 text-sm font-medium" style={{ color: '#e2e8f0' }}>{u.name}</span>
              <button
                onClick={() => openEditor(u)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:opacity-80"
                style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.25)' }}
              >
                <Icon name="edit" size={12} />
                ערוך
              </button>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedUser(null); }}
        >
          <div
            className="w-full max-w-3xl rounded-2xl p-6 max-h-[90vh] overflow-auto"
            style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-white">
                אילוצי {selectedUser.name} — שבוע {parseWeekNumber(nextWeekId)}
              </h3>
              <button onClick={() => setSelectedUser(null)} style={{ color: '#64748b' }}>
                <Icon name="x" size={18} />
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm" style={{ color: '#64748b' }}>טוען...</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="py-2 px-3 text-right font-medium" style={{ color: '#64748b', minWidth: 100 }}>משמרת</th>
                      {weekDates.map((date, i) => (
                        <th key={i} className="py-2 px-2 text-center font-medium" style={{ color: '#64748b', minWidth: 60 }}>
                          <span className="block">{DAY_LABELS[i]}</span>
                          <span className="block text-xs" style={{ color: '#334155' }}>
                            {date.getDate()}/{date.getMonth() + 1}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {definitions.map((def) => (
                      <tr key={def._id}>
                        <td className="py-2 px-3" style={{ color: '#cbd5e1' }}>
                          <span
                            className="inline-block w-2 h-2 rounded-full ml-2"
                            style={{ backgroundColor: def.color }}
                          />
                          {def.name}
                          <span className="block text-xs" style={{ color: '#475569' }}>
                            {def.startTime}–{def.endTime}
                          </span>
                        </td>
                        {weekDates.map((date, colIdx) => {
                          const dateKey = toDateKey(date);
                          const cellKey = `${def._id}:${dateKey}`;
                          return (
                            <td key={colIdx} className="py-2 px-2 text-center">
                              <input
                                type="checkbox"
                                checked={!!editChecked[cellKey]}
                                onChange={() => handleToggle(def._id, dateKey)}
                                className="w-4 h-4 cursor-pointer"
                                style={{ accentColor: '#ef4444' }}
                                aria-label={`${def.name} — ${DAY_LABELS[colIdx]}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs mt-4 mb-5" style={{ color: '#475569' }}>
              סמן משמרות שהעובד אינו יכול לעבוד בהן. שינויים נשמרים בלחיצה על שמור.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}
              >
                ביטול
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{ background: saving ? 'rgba(59,130,246,0.5)' : 'rgba(59,130,246,0.9)', color: '#fff', cursor: saving ? 'wait' : 'pointer' }}
              >
                {saving ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      )}
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

  // Poll read-receipts every 5s after a broadcast is sent
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
      // Immediately fetch initial status
      const statusRes = await notificationApi.getBroadcastStatus(res.broadcastId);
      setRecipients(statusRes.recipients);
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
    <section className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#cbd5e1' }}>
          הודעות לצוות
        </h2>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: '#475569' }}>
          <Icon name="users" size={12} />
          <span>{recipientCount} נמענים</span>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={cardStyle}>
        <div className="flex items-center gap-2 mb-3">
          <Icon name="bell" size={14} style={{ color: '#64748b' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
            שידור הודעה
          </span>
        </div>

        {!broadcastId ? (
          <>
            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              placeholder="הכנס עדכונים חשובים, הודעות ביקורת, או הוראות כלליות לכל הצוות..."
              className="w-full h-24 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#e2e8f0',
                direction: 'rtl',
              }}
              onFocus={e => (e.target.style.borderColor = 'rgba(59,130,246,0.4)')}
              onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
            />

            <div className="flex items-center justify-between mt-3">
              <span className="text-xs" style={{ color: '#475569' }}>
                {msg.length > 0 ? `${msg.length} תווים` : 'תומך Markdown'}
              </span>
              <button
                onClick={handleSend}
                disabled={!msg.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: msg.trim() ? 'rgba(59,130,246,0.9)' : 'rgba(255,255,255,0.05)',
                  color:      msg.trim() ? '#fff'                  : '#475569',
                  cursor:     msg.trim() ? 'pointer' : 'default',
                }}
              >
                <Icon name="send" size={14} />
                שלח לכולם
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Receipt panel */}
            <div
              className="rounded-xl px-4 py-3 mb-4"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon name="check" size={14} className="text-emerald-400" />
                  <span className="text-sm font-semibold" style={{ color: '#34d399' }}>ההודעה נשלחה!</span>
                </div>
                <span className="text-xs" style={{ color: '#475569' }}>
                  {readCount}/{recipients.length} קראו
                </span>
              </div>
              <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: recipients.length ? `${(readCount / recipients.length) * 100}%` : '0%',
                    background: 'linear-gradient(90deg,#10b981,#34d399)',
                  }}
                />
              </div>
            </div>

            <div className="space-y-1.5 mb-4 max-h-48 overflow-auto">
              {recipients.map((r, i) => (
                <div
                  key={r.userId}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <div
                    style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: avatarBg(i),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0,
                    }}
                  >
                    {avatarInitials(r.name)}
                  </div>
                  <span className="flex-1 text-xs" style={{ color: '#cbd5e1' }}>{r.name}</span>
                  {r.isRead
                    ? <Icon name="check" size={13} style={{ color: '#10b981' }} />
                    : <Icon name="clock" size={13} style={{ color: '#475569' }} />
                  }
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs" style={{ color: '#475569' }}>מתרענן כל 5 שניות</span>
              <button
                onClick={handleReset}
                className="text-xs font-medium px-4 py-2 rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}
              >
                שלח הודעה חדשה
              </button>
            </div>
          </>
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

  const statusLabel =
    result.status === 'OPTIMAL'  ? 'אופטימלי' :
    result.status === 'FEASIBLE' ? 'ישים' :
    result.status === 'RELAXED'  ? 'מרופה' : result.status;

  return (
    <div
      className="rounded-2xl p-5 mb-6"
      style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${statusColor}40` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Icon name="zap" size={16} style={{ color: statusColor }} />
          <span className="text-sm font-bold text-white">תוצאות הפקת לוח שיבוץ</span>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: `${statusColor}20`, color: statusColor }}
          >
            {statusLabel}
          </span>
        </div>
        <button onClick={onClose} style={{ color: '#475569' }}>
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="text-xl font-bold mb-0.5" style={{ color: statusColor }}>
            {result.assignmentCount}
          </div>
          <div className="text-xs" style={{ color: '#475569' }}>שיבוצים</div>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="text-xl font-bold mb-0.5 text-white">
            {(result.solveTimeMs / 1000).toFixed(2)}s
          </div>
          <div className="text-xs" style={{ color: '#475569' }}>זמן פתרון</div>
        </div>
        <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="text-xl font-bold mb-0.5" style={{ color: result.warnings.length ? '#f59e0b' : '#10b981' }}>
            {result.warnings.length}
          </div>
          <div className="text-xs" style={{ color: '#475569' }}>אזהרות</div>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div className="rounded-xl px-4 py-3 mb-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: '#fbbf24' }}>אזהרות</div>
          {result.warnings.map((w, i) => (
            <div key={i} className="text-xs" style={{ color: '#94a3b8' }}>• {w.message}</div>
          ))}
        </div>
      )}

      {result.violations.length > 0 && (
        <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: '#f87171' }}>הפרות (מרופה)</div>
          {result.violations.map((v, i) => (
            <div key={i} className="text-xs" style={{ color: '#94a3b8' }}>• {v.message}</div>
          ))}
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
}: {
  weekId: string;
  onToast: (t: Toast) => void;
  onGenerateResult: (r: GenerateResult) => void;
}) {
  const navigate = useNavigate();
  const [active, setActive]         = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setActive('generate');
    try {
      const result = await scheduleApi.generate(weekId);
      onGenerateResult(result);
      onToast({ message: 'לוח שיבוץ הופק בהצלחה!', type: 'success' });
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : 'שגיאה בהפקת לוח שיבוץ', type: 'error' });
    } finally {
      setGenerating(false);
      setTimeout(() => setActive(null), 600);
    }
  }

  const actions = [
    { id: 'generate',  label: 'הפקת לוח שיבוץ',   sub: `מנוע CSP · שבוע ${parseWeekNumber(weekId)}`, icon: 'zap'      as IconName, color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)',  onClick: handleGenerate },
    { id: 'leaves',    label: 'אישור חופשות',       sub: 'בקרוב',                                       icon: 'check'    as IconName, color: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.25)',  onClick: () => onToast({ message: 'אישור חופשות — בקרוב', type: 'info' }) },
    { id: 'emergency', label: 'הוספת משמרת חירום',  sub: 'שיבוץ ידני',                                  icon: 'plus'     as IconName, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)',  onClick: () => onToast({ message: 'הוספת משמרת חירום — בקרוב', type: 'info' }) },
    { id: 'export',    label: 'ייצוא דוח',           sub: 'PDF / CSV',                                   icon: 'download' as IconName, color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.25)',  onClick: () => onToast({ message: 'ייצוא דוח — בקרוב', type: 'info' }) },
    { id: 'users',     label: 'ניהול עובדים',        sub: 'עובדים פעילים',                                icon: 'users'    as IconName, color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',   border: 'rgba(6,182,212,0.25)',   onClick: () => navigate('/users') },
    { id: 'audit',     label: 'יומן ביקורת',         sub: 'פעילות אחרונה',                               icon: 'log'      as IconName, color: '#ec4899', bg: 'rgba(236,72,153,0.12)',  border: 'rgba(236,72,153,0.25)',  onClick: () => document.getElementById('audit-log')?.scrollIntoView({ behavior: 'smooth' }) },
  ];

  return (
    <section className="mb-6">
      <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: '#cbd5e1' }}>
        פעולות מהירות
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {actions.map(a => (
          <button
            key={a.id}
            onClick={a.onClick}
            disabled={a.id === 'generate' && generating}
            className="group rounded-2xl p-4 text-right transition-all"
            style={{
              background: active === a.id ? a.bg : 'rgba(255,255,255,0.03)',
              border: `1px solid ${active === a.id ? a.border : 'rgba(255,255,255,0.07)'}`,
              transform: active === a.id ? 'scale(0.97)' : 'scale(1)',
              cursor: a.id === 'generate' && generating ? 'wait' : 'pointer',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = a.bg;
              e.currentTarget.style.borderColor = a.border;
            }}
            onMouseLeave={e => {
              if (active !== a.id) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
              }
            }}
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center mb-2 transition-transform group-hover:scale-110"
              style={{ background: a.bg, border: `1px solid ${a.border}` }}
            >
              <Icon name={a.icon} size={17} style={{ color: a.color }} />
            </div>
            <div className="text-sm font-semibold leading-tight mb-1" style={{ color: '#e2e8f0' }}>{a.label}</div>
            <div className="text-xs" style={{ color: '#475569' }}>
              {a.id === 'generate' && generating ? 'מעבד...' : a.sub}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Audit log widget ─────────────────────────────────────────────────────────

function AuditLogWidget() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auditLogApi.getLogs(8).then(res => {
      setLogs(res.logs ?? []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <section className="mb-6" id="audit-log">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: '#cbd5e1' }}>
          פעילות אחרונה
        </h2>
        <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors">← הכל</button>
      </div>
      <div className="rounded-2xl overflow-hidden" style={cardStyle}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
            >
              <div className="w-7 h-7 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="flex-1 space-y-1">
                <div className="h-2.5 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', width: '60%' }} />
                <div className="h-2 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.04)', width: '40%' }} />
              </div>
            </div>
          ))
        ) : logs.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm" style={{ color: '#475569' }}>אין פעילות עדיין</div>
        ) : (
          logs.map((entry, i) => {
            const type = actionToType(entry.action);
            const label = ACTION_LABELS[entry.action] ?? entry.action;
            const performer = typeof entry.performedBy === 'object' && entry.performedBy !== null
              ? (entry.performedBy as { name: string }).name
              : 'מנהל';
            const timeStr = new Date(entry.createdAt).toLocaleTimeString('he-IL', {
              hour: '2-digit', minute: '2-digit',
            });
            return (
              <div
                key={entry._id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
                style={{ borderBottom: i < logs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${AUDIT_COLORS[type]}20` }}
                >
                  <Icon name={AUDIT_ICONS[type]} size={12} style={{ color: AUDIT_COLORS[type] }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate" style={{ color: '#cbd5e1' }}>{label}</div>
                  <div className="text-xs truncate" style={{ color: '#475569' }}>{performer}</div>
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: '#334155' }}>{timeStr}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface ScheduleStats {
  total: number;
  filled: number;
  partial: number;
  empty: number;
  scheduleStatus: string | null;
}

function Sidebar({
  weekId,
  totalUsers,
  stats,
}: {
  weekId: string;
  totalUsers: number;
  stats: ScheduleStats | null;
}) {
  const STATS = [
    { label: 'סה״כ משמרות', value: stats ? String(stats.total)   : '—', color: '#3b82f6' },
    { label: 'מלאות',        value: stats ? String(stats.filled)  : '—', color: '#10b981' },
    { label: 'חלקיות',       value: stats ? String(stats.partial) : '—', color: '#f59e0b' },
    { label: 'ריקות',        value: stats ? String(stats.empty)   : '—', color: '#ef4444' },
  ];

  const weekNum = parseWeekNumber(weekId);
  const scheduleStatusLabel =
    stats?.scheduleStatus === 'published' ? 'פורסם' :
    stats?.scheduleStatus === 'draft'     ? 'טיוטה' :
    stats?.scheduleStatus === 'archived'  ? 'ארכיון' : 'לא נוצר';
  const scheduleStatusOk = stats?.scheduleStatus === 'published';

  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4" style={cardStyle}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
            סטטיסטיקות שבועיות
          </span>
          <Icon name="calendar" size={13} style={{ color: '#334155' }} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {STATS.map(s => (
            <div key={s.label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-xl font-bold mb-0.5" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs" style={{ color: '#475569' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-4" style={cardStyle}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
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
              <span className="text-xs" style={{ color: '#64748b' }}>{item.label}</span>
              <span
                className="text-xs font-medium"
                style={{ color: item.ok === true ? '#34d399' : item.ok === false ? '#f87171' : '#94a3b8' }}
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

// ─── Notification bell ────────────────────────────────────────────────────────

function NotificationBell({ count }: { count: number }) {
  return (
    <div className="fixed top-5 left-5 z-50">
      <button
        className="relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#94a3b8',
        }}
      >
        <Icon name="bell" size={16} />
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full text-white font-bold"
            style={{ background: '#ef4444', fontSize: 9 }}
          >
            {count}
          </span>
        )}
      </button>
    </div>
  );
}

// ─── Toast notification ───────────────────────────────────────────────────────

function ToastNotification({ toast, onDismiss }: { toast: Toast | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const colors = {
    success: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', text: '#34d399' },
    error:   { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.3)', text: '#f87171'  },
    info:    { bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)', text: '#93c5fd' },
  };
  const c = colors[toast.type];

  return (
    <div
      className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium max-w-xs"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {toast.message}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const [users, setUsers]                           = useState<User[]>([]);
  const [missingUsers, setMissingUsers]             = useState<User[] | null>(null);
  const [toast, setToast]                           = useState<Toast | null>(null);
  const [scheduleStats, setScheduleStats]           = useState<ScheduleStats | null>(null);
  const [generateResult, setGenerateResult]         = useState<GenerateResult | null>(null);
  const [definitions, setDefinitions]               = useState<ShiftDefinition[]>([]);

  const weekId     = getCurrentWeekId();
  const nextWeekId = getNextWeekId(weekId);
  const employees  = users.filter(u => u.isActive);

  // Load users
  useEffect(() => {
    userApi.getUsers().then(res => {
      setUsers(res.users);
    }).catch(console.error);
  }, []);

  // Load shift definitions
  useEffect(() => {
    shiftDefinitionApi.getActive().then(res => {
      setDefinitions(res.definitions);
    }).catch(console.error);
  }, []);

  // Load schedule stats (sidebar)
  useEffect(() => {
    scheduleApi.getAll().then(async (res) => {
      const schedule = res.schedules.find((s: Schedule) => s.weekId === weekId);
      if (!schedule) {
        setScheduleStats({ total: 0, filled: 0, partial: 0, empty: 0, scheduleStatus: null });
        return;
      }
      const shiftsRes = await shiftApi.getBySchedule(schedule._id);
      const shifts = shiftsRes.shifts;
      setScheduleStats({
        total:   shifts.length,
        filled:  shifts.filter((s: Shift) => s.status === 'filled').length,
        partial: shifts.filter((s: Shift) => s.status === 'partial').length,
        empty:   shifts.filter((s: Shift) => s.status === 'empty').length,
        scheduleStatus: schedule.status,
      });
    }).catch(console.error);
  }, [weekId]);

  // Load missing constraints for next week
  useEffect(() => {
    if (users.length === 0) return;
    const employeeUsers = users.filter(u => u.role === 'employee' && u.isActive);
    let active = true;

    Promise.all(
      employeeUsers.map(u =>
        constraintApi.getForUser(nextWeekId, u._id)
          .then(res => ({ user: u, hasMissing: res.constraint === null }))
          .catch(() => ({ user: u, hasMissing: true }))
      )
    ).then(results => {
      if (!active) return;
      setMissingUsers(results.filter(r => r.hasMissing).map(r => r.user));
    });

    return () => { active = false; };
  }, [users, nextWeekId]);

  return (
    <>
      <style>{`
        @keyframes glow {
          0%,100% { box-shadow: 0 0 10px 2px rgba(59,130,246,0.3), inset 0 0 20px rgba(59,130,246,0.05); }
          50%      { box-shadow: 0 0 28px 8px rgba(59,130,246,0.5), inset 0 0 30px rgba(59,130,246,0.1); }
        }
        .current-glow { animation: glow 2.5s ease-in-out infinite; }
      `}</style>

      <div
        className="min-h-screen font-sans"
        style={{ background: 'linear-gradient(135deg,#0f172a 0%,#0c1527 100%)', direction: 'rtl' }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <Header weekId={weekId} />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2">
              <ShiftOverview users={employees} weekId={weekId} definitions={definitions} />
              <MissingConstraints missingUsers={missingUsers} />
              <ConstraintManagerPanel
                users={users}
                nextWeekId={nextWeekId}
                definitions={definitions}
                onToast={setToast}
              />
              <BroadcastCenter recipientCount={employees.length} onToast={setToast} />
              <GeneratedSchedulePanel result={generateResult} onClose={() => setGenerateResult(null)} />
              <QuickActions weekId={weekId} onToast={setToast} onGenerateResult={setGenerateResult} />
            </div>

            <div className="xl:col-span-1">
              <AuditLogWidget />
              <Sidebar weekId={weekId} totalUsers={employees.length} stats={scheduleStats} />
            </div>
          </div>
        </div>

        <NotificationBell count={missingUsers?.length ?? 0} />
        <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
      </div>
    </>
  );
}
