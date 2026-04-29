import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LogoutConfirmDialog from '../components/LogoutConfirmDialog';
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
  | 'settings' | 'log' | 'x' | 'zap' | 'eye' | 'edit' | 'home' | 'help';

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
    home:     <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
    help:     <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
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
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  boxShadow: 'rgba(61, 83, 222, 0.16) 0px 4px 16px 0px',
  borderRadius: '12px',
};

const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

// ─── Header ───────────────────────────────────────────────────────────────────

function SidebarNavLink({ icon, label, active, onClick }: { icon: IconName; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-r-[3px] ${
        active
          ? 'bg-[#F1F8FF] text-[#056AE5] border-[#056AE5] font-bold'
          : 'text-[#484C50] hover:bg-[#F1F8FF] hover:text-[#056AE5] border-transparent'
      }`}
    >
      <Icon name={icon} size={18} className={active ? 'text-[#056AE5]' : 'text-[#646769]'} />
      {label}
    </button>
  );
}

function TopHeader({ weekId, onToast, onSidebarToggle }: { weekId: string; onToast?: (t: Toast) => void; onSidebarToggle?: () => void }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const DAYS   = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const MONTHS = ['ינו׳','פבר׳','מרץ','אפר׳','מאי','יוני','יולי','אוג׳','ספט׳','אוק׳','נוב׳','דצמ׳'];
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const dateStr = `יום ${DAYS[now.getDay()]}, ${now.getDate()} ב${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const weekNum = parseWeekNumber(weekId);

  return (
    <header className="bg-white border-b border-[#F0F0F0] px-4 lg:px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
      <div className="flex items-center gap-4">
        <button
          onClick={() => onSidebarToggle?.()}
          className="lg:hidden p-2 -mr-2 text-on-surface-variant hover:bg-neutral-gray rounded-lg transition-colors"
        >
          <Icon name="home" size={24} />
        </button>
        <h1 className="font-h2 text-h2 text-[#010636] tracking-tight truncate">שלום, מנהל! 👋</h1>
      </div>

      <div className="flex items-center gap-2 lg:gap-6">
        <div className="hidden md:flex items-center gap-4 text-sm font-medium text-[#2B358F]">
          <div className="flex items-center gap-2">
            <Icon name="calendar" size={16} className="text-[#056AE5]" />
            שבוע {weekNum}
          </div>
          <div className="w-1.5 h-1.5 rounded-full bg-[#e2e8f0]" />
          <div className="hidden lg:flex items-center gap-2">
            <Icon name="clock" size={16} className="text-[#056AE5]" />
            <span style={{ direction: 'ltr', display: 'inline-block' }}>{time}</span>
          </div>
          <div className="hidden lg:block w-1.5 h-1.5 rounded-full bg-[#e2e8f0]" />
          <div className="font-bold text-[#2B358F]">{dateStr}</div>
        </div>

        <div className="flex items-center gap-1 lg:gap-3 border-r border-[#F0F0F0] pr-2 lg:pr-6">
          <button 
            className="w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-neutral-gray transition-colors"
            onClick={() => onToast?.({ message: 'עזרה — בקרוב', type: 'info' })}
          >
            <Icon name="help" size={18} />
          </button>
          <button className="relative w-8 h-8 lg:w-10 lg:h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-neutral-gray transition-colors">
            <Icon name="bell" size={18} />
            <span className="absolute top-1.5 lg:top-2.5 right-1.5 lg:right-2.5 w-2 h-2 lg:w-2.5 lg:h-2.5 rounded-full bg-error border-2 border-white" />
          </button>
          <button className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-secondary/10 text-secondary font-bold flex items-center justify-center border-2 border-white shadow-sm mr-1 lg:ml-2">
            מ
          </button>
        </div>
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
  const isNext    = type === 'next';

  if (isCurrent) {
    return (
      <div
        className="text-white rounded-xl p-md flex flex-col gap-sm relative overflow-hidden h-full current-glow"
        style={{ background: 'linear-gradient(135deg, #010636 0%, #2B358F 100%)', boxShadow: 'rgba(61, 83, 222, 0.35) 0px 8px 24px 0px' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
        <div className="flex justify-between items-center font-label-caps text-label-caps opacity-90 relative z-10">
          <span style={{ direction: 'ltr' }}>{shift.start} - {shift.end}</span>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span>פעיל</span>
          </div>
        </div>
        <h3 className="font-h3 text-h3 text-white relative z-10">משמרת נוכחית</h3>
        <p className="font-body-sm text-body-sm opacity-90 relative z-10">{shift.label}</p>
        <div className="mt-auto pt-sm relative z-10">
          <span className="font-body-sm text-body-sm font-medium">{staff.length} עובדים במשמרת</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white border border-[#e2e8f0] rounded-xl p-md flex flex-col gap-sm h-full ${isPrev ? 'opacity-70' : 'hover:shadow-md transition-shadow'}`}
      style={isPrev ? undefined : { boxShadow: 'rgba(61, 83, 222, 0.16) 0px 4px 16px 0px' }}
    >
      <div className={`flex justify-between items-center font-label-caps text-label-caps ${isNext ? 'text-[#056AE5]' : 'text-on-surface-variant'}`}>
        <span style={{ direction: 'ltr' }}>{shift.start} - {shift.end}</span>
        <Icon name={isPrev ? 'clock' : 'calendar'} size={16} />
      </div>
      <h3 className="font-h3 text-h3 text-on-surface">{isPrev ? 'משמרת קודמת' : 'משמרת הבאה'}</h3>
      <p className="font-body-sm text-body-sm text-on-surface-variant">{shift.label}</p>
      <div className="mt-auto pt-sm flex items-center justify-between">
        <div className="flex -space-x-2 space-x-reverse">
          {staff.length === 0 ? (
            <span className="text-[10px] text-on-surface-variant opacity-50">אין משובצים</span>
          ) : (
            staff.map((s, i) => (
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
            ))
          )}
        </div>
        {isNext && staff.length === 0 && (
          <span className="font-label-caps text-label-caps text-error bg-error-container text-on-error-container px-2 py-1 rounded">חסר עובד</span>
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
      if (defIdx === 0) return employees.filter(u => u.isFixedMorningEmployee).map(u => ({ id: u._id, name: u.name, isFixed: true }));
      const nonFixed = employees.filter(u => !u.isFixedMorningEmployee);
      if (defIdx === 1) return nonFixed.filter((_, i) => i % 2 === 0).map(u => ({ id: u._id, name: u.name, isFixed: false }));
      return nonFixed.filter((_, i) => i % 2 !== 0).map(u => ({ id: u._id, name: u.name, isFixed: false }));
    }

    const todayShift = shifts.find((s) => {
      const shiftDateKey = toDateKey(new Date(s.date));
      return shiftDateKey === todayKey && s.definitionId === def._id;
    });

    if (!todayShift) return [];

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

  return (
    <section className="col-span-1 md:col-span-2 flex flex-col gap-md">
      <h2 className="font-h2 text-h2 text-[#010636] border-r-4 border-[#056AE5] pr-3">סטטוס משמרות</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <ShiftCard shift={SHIFTS[prevIdx]} staff={staffForShiftDef(prevIdx)} type="prev" />
        <ShiftCard shift={SHIFTS[curIdx]}  staff={staffForShiftDef(curIdx)}  type="current" />
        <ShiftCard shift={SHIFTS[nextIdx]} staff={staffForShiftDef(nextIdx)} type="next" />
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
    <section className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-md">
        <div className="flex items-center gap-2">
          <h2 className="font-h2 text-h2 text-[#010636] border-r-4 border-[#056AE5] pr-3">
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
        <span className="text-xs text-on-surface-variant font-medium">דדליין: שני 23:59 IST</span>
      </div>

      <div className="flex-1">
        {missingUsers === null ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-container animate-pulse" />
            <span className="font-body-sm text-body-sm text-on-surface-variant">טוען נתונים...</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md flex items-center gap-3 shadow-sm">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-50">
              <Icon name="check" size={16} className="text-green-600" />
            </div>
            <span className="font-body-sm text-body-sm text-on-surface-variant">כל הצוות הגיש אילוצים לשבוע הבא.</span>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
            <div className="bg-surface-container-high px-md py-sm flex justify-between text-label-caps font-label-caps text-on-surface-variant">
              <span>שם העובד</span>
              <span>פעולות</span>
            </div>
            <div className="divide-y divide-outline-variant">
              {visible.map((u, i) => (
                <div
                  key={u._id}
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
                      <span className="font-body-base text-body-base text-on-surface font-semibold">{u.name}</span>
                      <Icon name="alert" size={14} className="text-error" />
                    </div>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      {u.role === 'manager' ? 'מנהל' : 'עובד'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRemind(u._id)}
                      className={`font-button text-button px-4 py-2 rounded-full transition-all border ${
                        reminded.includes(u._id)
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-[#056AE5] text-white border-[#056AE5] hover:bg-[#0457B8]'
                      }`}
                    >
                      {reminded.includes(u._id) ? 'נשלח!' : 'תזכורת'}
                    </button>
                    <button
                      onClick={() => setDismissed(d => [...d, u._id])}
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-surface-container text-on-surface-variant"
                    >
                      <Icon name="x" size={16} />
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
      <div className="flex items-center justify-between mb-md">
        <h2 className="font-h2 text-h2 text-[#010636] border-r-4 border-[#056AE5] pr-3">
          ניהול אילוצים
        </h2>
        <span className="text-xs text-on-surface-variant font-medium">שבוע {parseWeekNumber(nextWeekId)}</span>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        {employees.length === 0 ? (
          <div className="px-md py-lg text-sm text-center text-on-surface-variant">אין עובדים פעילים</div>
        ) : (
          employees.map((u, i) => (
            <div
              key={u._id}
              className={`flex items-center gap-3 px-md py-3 hover:bg-surface-container-low transition-colors ${i < employees.length - 1 ? 'border-b border-outline-variant/30' : ''}`}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                style={{ background: avatarBg(i) }}
              >
                {avatarInitials(u.name)}
              </div>
              <span className="flex-1 font-body-sm text-body-sm text-on-surface font-medium">{u.name}</span>
              <button
                onClick={() => openEditor(u)}
                className="flex items-center gap-1.5 font-button text-[11px] px-3 py-1.5 rounded-md transition-all border border-[#056AE5] text-[#2B358F] hover:bg-[#F1F8FF]"
              >
                <Icon name="edit" size={12} />
                עריכה
              </button>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedUser(null); }}
        >
          <div
            className="w-full max-w-3xl rounded-2xl p-6 max-h-[90vh] overflow-auto bg-white shadow-xl border border-slate-200"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-slate-800">
                אילוצי {selectedUser.name} — שבוע {parseWeekNumber(nextWeekId)}
              </h3>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <Icon name="x" size={18} />
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm text-slate-500">טוען...</div>
            ) : (
              <div className="overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm border-collapse bg-white">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="py-3 px-3 text-right font-medium text-slate-500" style={{ minWidth: 100 }}>משמרת</th>
                      {weekDates.map((date, i) => (
                        <th key={i} className="py-3 px-2 text-center font-medium text-slate-500 border-r border-slate-200" style={{ minWidth: 60 }}>
                          <span className="block">{DAY_LABELS[i]}</span>
                          <span className="block text-xs font-normal mt-0.5 text-slate-400">
                            {date.getDate()}/{date.getMonth() + 1}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {definitions.map((def, defIdx) => (
                      <tr key={def._id} className={defIdx < definitions.length - 1 ? 'border-b border-slate-100' : ''}>
                        <td className="py-3 px-3 text-slate-700 font-medium">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full ml-2"
                            style={{ backgroundColor: def.color }}
                          />
                          {def.name}
                          <span className="block text-xs font-normal text-slate-500 mt-0.5 mr-4.5">
                            {def.startTime}–{def.endTime}
                          </span>
                        </td>
                        {weekDates.map((date, colIdx) => {
                          const dateKey = toDateKey(date);
                          const cellKey = `${def._id}:${dateKey}`;
                          return (
                            <td key={colIdx} className="py-2 px-2 text-center border-r border-slate-100 hover:bg-slate-50 transition-colors">
                              <input
                                type="checkbox"
                                checked={!!editChecked[cellKey]}
                                onChange={() => handleToggle(def._id, dateKey)}
                                className="w-4 h-4 cursor-pointer rounded border-slate-300 text-red-500 focus:ring-red-500"
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

            <p className="text-xs mt-4 mb-5 text-slate-500 flex items-center gap-2">
              <Icon name="alert" size={14} className="text-slate-400" />
              סמן משמרות שהעובד אינו יכול לעבוד בהן. שינויים נשמרים בלחיצה על שמור.
            </p>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                  saving ? 'bg-[#056AE5]/70 text-white cursor-wait' : 'bg-[#056AE5] text-white hover:bg-[#0457B8] hover:shadow'
                }`}
              >
                {saving ? 'שומר...' : 'שמור אילוצים'}
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
    <section className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-md">
        <h2 className="font-h2 text-h2 text-[#010636] border-r-4 border-[#056AE5] pr-3">
          הודעות לצוות
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-medium">
          <Icon name="users" size={14} className="text-secondary" />
          <span>{recipientCount} נמענים</span>
        </div>
      </div>

      <div className="flex-1 bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm flex flex-col">
        {!broadcastId ? (
          <>
            <div className="flex items-center gap-2 mb-sm">
              <Icon name="bell" size={14} className="text-secondary" />
              <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
                שידור הודעה חדשה
              </span>
            </div>

            <textarea
              value={msg}
              onChange={e => setMsg(e.target.value)}
              placeholder="הכנס עדכונים חשובים, הודעות ביקורת, או הוראות כלליות לכל הצוות..."
              className="w-full flex-1 min-h-[120px] rounded-lg px-4 py-3 text-body-sm font-body-sm resize-none focus:outline-none focus:ring-2 focus:ring-[rgba(43,53,143,0.1)] focus:border-[#2B358F] transition-all bg-white border border-[#16254F] text-on-surface"
              style={{ direction: 'rtl' }}
            />

            <div className="flex items-center justify-between mt-md">
              <span className="text-xs text-on-surface-variant font-medium opacity-70">
                {msg.length > 0 ? `${msg.length} תווים` : 'תומך Markdown'}
              </span>
              <button
                onClick={handleSend}
                disabled={!msg.trim()}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-button text-button transition-all shadow-sm ${
                  msg.trim() ? 'bg-[#056AE5] text-white hover:bg-[#0457B8] hover:shadow-md' : 'bg-surface-container text-on-surface-variant/40 cursor-not-allowed'
                }`}
              >
                <Icon name="send" size={14} />
                שלח לכולם
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col h-full">
            {/* Receipt panel */}
            <div className="rounded-lg px-4 py-3 mb-md bg-green-50 border border-green-200">
              <div className="flex items-center justify-between mb-sm">
                <div className="flex items-center gap-2">
                  <Icon name="check" size={16} className="text-green-600" />
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
                    ? <div className="flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-100"><Icon name="check" size={10} /> נקרא</div>
                    : <div className="flex items-center gap-1 text-[10px] font-bold text-on-surface-variant opacity-60 bg-surface-container px-2 py-0.5 rounded border border-outline-variant/20"><Icon name="clock" size={10} /> ממתין</div>
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
                className="font-button text-button px-4 py-2 rounded-lg transition-all bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
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
      className="rounded-2xl p-5 mb-6 shadow-sm"
      style={{ background: '#ffffff', border: `1px solid ${statusColor}40` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: statusBg }}>
            <Icon name="zap" size={16} style={{ color: statusColor }} />
          </div>
          <span className="text-sm font-bold text-slate-800">תוצאות הפקת לוח שיבוץ</span>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full border"
            style={{ background: statusBg, color: statusColor, borderColor: `${statusColor}30` }}
          >
            {statusLabel}
          </span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors bg-slate-50 hover:bg-slate-100 p-1.5 rounded-md">
          <Icon name="x" size={16} />
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
            <Icon name="alert" size={12} />
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
            <Icon name="alert" size={12} />
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

/**
 * QuickActions Component - Redesigned for Stitch Design System
 */
function QuickActions({
  weekId,
  onToast,
  onGenerateResult,
}: {
  weekId: string;
  onToast: (t: Toast) => void;
  onGenerateResult: (r: GenerateResult) => void;
}) {
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      const result = await scheduleApi.generate(weekId);
      onGenerateResult(result);
      onToast({ message: 'לוח שיבוץ הופק בהצלחה!', type: 'success' });
    } catch (err) {
      onToast({ message: err instanceof Error ? err.message : 'שגיאה בהפקת לוח שיבוץ', type: 'error' });
    } finally {
      setGenerating(false);
    }
  }

  const actions = [
    { id: 'generate',  label: 'ייצור סידור עבודה', icon: 'zap'      as IconName, onClick: handleGenerate, subtitle: 'אוטומציה מלאה',   isPrimary: true  },
    { id: 'leaves',    label: 'אישור חופשות',       icon: 'check'    as IconName, onClick: () => onToast({ message: 'אישור חופשות — בקרוב', type: 'info' }), subtitle: 'ניהול היעדרויות', isPrimary: false },
    { id: 'emergency', label: 'משמרת חירום',        icon: 'alert'    as IconName, onClick: () => onToast({ message: 'הוספת משמרת חירום — בקרוב', type: 'info' }), subtitle: 'שיבוץ דחוף',       isPrimary: false },
    { id: 'export',    label: 'ייצוא דוחות',        icon: 'download' as IconName, onClick: () => onToast({ message: 'ייצוא דוח — בקרוב', type: 'info' }), subtitle: 'PDF / Excel',       isPrimary: false },
  ];

  return (
    <section className="flex flex-col w-full">
      <div className="flex items-center justify-between mb-md">
        <h2 className="font-h2 text-h2 text-[#010636] border-r-4 border-[#056AE5] pr-3">
          פעולות מהירות
        </h2>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-lg p-md" style={{ boxShadow: 'rgba(61, 83, 222, 0.16) 0px 4px 16px 0px' }}>
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
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all border font-medium min-h-[56px] ${
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
                    <Icon name={a.icon} size={18} />
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

function AuditLogWidget() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auditLogApi.getLogs(8).then(res => {
      setLogs(res.logs ?? []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <section className="flex flex-col h-full" id="audit-log">
      <div className="flex items-center justify-between mb-md">
        <h2 className="font-h2 text-h2 text-[#010636] border-r-4 border-[#056AE5] pr-3">
          פעילות אחרונה
        </h2>
        <button className="font-button text-xs text-secondary hover:underline font-medium transition-colors">צפה בהכל</button>
      </div>

      <div className="rounded-xl overflow-hidden" style={cardStyle}>
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
            const performer = typeof entry.performedBy === 'object' && entry.performedBy !== null
              ? (entry.performedBy as { name: string }).name
              : 'מנהל';
            const timeStr = new Date(entry.createdAt).toLocaleTimeString('he-IL', {
              hour: '2-digit', minute: '2-digit',
            });
            return (
              <div
                key={entry._id}
                className={`flex items-center gap-3 px-md py-3 hover:bg-surface-container-low transition-colors ${i < logs.length - 1 ? 'border-b border-outline-variant/30' : ''}`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `${AUDIT_COLORS[type]}15`, border: `1px solid ${AUDIT_COLORS[type]}30` }}
                >
                  <Icon name={AUDIT_ICONS[type]} size={14} style={{ color: AUDIT_COLORS[type] }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-body-sm text-sm font-semibold truncate text-on-surface">{label}</div>
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
    { label: 'סה״כ משמרות', value: stats ? String(stats.total)   : '—', color: '#056AE5' },
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
    info:    { bg: 'rgba(43,53,143,0.12)',  border: 'rgba(43,53,143,0.25)', text: '#2B358F' },
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
  const [isSidebarOpen, setIsSidebarOpen]           = useState(false);
  const [showLogoutDialog, setShowLogoutDialog]     = useState(false);

  const { logout } = useAuth();

  const weekId     = getCurrentWeekId();
  const nextWeekId = getNextWeekId(weekId);
  const employees  = users.filter(u => u.isActive);

  function handleLogout() {
    logout();
    navigate('/login');
  }

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

  const navigate = useNavigate();

  return (
    <>
      <style>{`
        @keyframes glow {
          0%,100% { box-shadow: 0 0 10px 2px rgba(59,130,246,0.2), inset 0 0 20px rgba(59,130,246,0.05); }
          50%      { box-shadow: 0 0 20px 6px rgba(59,130,246,0.4), inset 0 0 30px rgba(59,130,246,0.1); }
        }
        .current-glow { animation: glow 2.5s ease-in-out infinite; }
      `}</style>

      <div className="min-h-screen font-sans bg-[#F4F7FA] flex" style={{ direction: 'rtl' }}>
        {/* Backdrop for mobile sidebar */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-[#010636]/40 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Right Sidebar */}
        <aside className={`w-64 bg-white border-l border-[#e2e8f0] flex flex-col fixed inset-y-0 right-0 z-40 transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-6 border-b border-[#F0F0F0] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#010636] flex items-center justify-center">
              <Icon name="calendar" size={16} className="text-white" />
            </div>
            <span className="font-bold text-[#010636] text-lg">ניהול משמרות</span>
          </div>
          <div className="p-4">
            <button
              className="w-full bg-[#056AE5] hover:bg-[#0457B8] text-white rounded-full py-2.5 flex items-center justify-center gap-2 font-medium transition-colors"
              onClick={() => setToast({ message: 'משמרת חדשה — בקרוב', type: 'info' })}
            >
              <Icon name="plus" size={16} />
              משמרת חדשה
            </button>
          </div>
          <nav className="flex-1 px-3 py-2 space-y-1">
            <SidebarNavLink icon="home" label="דאשבורד" active />
            <SidebarNavLink icon="users" label="עובדים" onClick={() => navigate('/users')} />
            <SidebarNavLink icon="calendar" label="לוחות זמנים" />
            <SidebarNavLink icon="log" label="דוחות" />
            <SidebarNavLink icon="settings" label="הגדרות" />
          </nav>
          <div className="p-4 border-t border-[#F0F0F0]">
            <SidebarNavLink icon="log" label="התנתק" onClick={() => setShowLogoutDialog(true)} />
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 lg:mr-64 min-w-0 transition-all duration-300">
           <TopHeader weekId={weekId} onToast={setToast} onSidebarToggle={() => setIsSidebarOpen(true)} />
           
           <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div className="space-y-6">
                 {/* Quick Actions at the top */}
                 <QuickActions weekId={weekId} onToast={setToast} onGenerateResult={setGenerateResult} />
                 
                 {generateResult && (
                   <GeneratedSchedulePanel result={generateResult} onClose={() => setGenerateResult(null)} />
                 )}

                 <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Main content column */}
                    <div className="xl:col-span-2 space-y-6">
                      <ShiftOverview users={employees} weekId={weekId} definitions={definitions} />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <BroadcastCenter recipientCount={employees.length} onToast={setToast} />
                         <MissingConstraints missingUsers={missingUsers} />
                      </div>
                    </div>
                    
                    {/* Side content column */}
                    <div className="xl:col-span-1 space-y-6">
                      <Sidebar weekId={weekId} totalUsers={employees.length} stats={scheduleStats} />
                      <ConstraintManagerPanel users={users} nextWeekId={nextWeekId} definitions={definitions} onToast={setToast} />
                      <AuditLogWidget />
                    </div>
                 </div>
              </div>
           </main>
        </div>

        <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
        <LogoutConfirmDialog
          open={showLogoutDialog}
          onCancel={() => setShowLogoutDialog(false)}
          onConfirm={handleLogout}
        />
      </div>
    </>
  );
}
