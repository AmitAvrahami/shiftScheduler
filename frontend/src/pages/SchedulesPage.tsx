import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import MaterialIcon from '../components/MaterialIcon';
import { scheduleApi, shiftApi, constraintApi, adminApi } from '../lib/api';
import type { Schedule } from '../lib/api';

// ─── Week utilities ───────────────────────────────────────────────────────────

const IST_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function getCurrentWeekId(): string {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const thursday = new Date(
    Date.UTC(nowIST.getUTCFullYear(), nowIST.getUTCMonth(), nowIST.getUTCDate())
  );
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thursday.getTime() - jan1.getTime()) / DAY_MS + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getNextWeekId(weekId: string): string {
  const [yearStr, weekStr] = weekId.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = jan4.getTime() - (jan4Day - 1) * DAY_MS;
  const monday = new Date(week1Monday + (week - 1) * 7 * DAY_MS);
  const nextMonday = new Date(monday.getTime() + 7 * DAY_MS);
  const thu = new Date(nextMonday.getTime() + 3 * DAY_MS);
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((thu.getTime() - jan1.getTime()) / DAY_MS + 1) / 7);
  return `${thu.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

function parseWeekNumber(weekId: string): number {
  return parseInt(weekId.split('-W')[1], 10);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function weekLabel(s: Schedule): string {
  const wk = parseWeekNumber(s.weekId);
  return `שבוע ${wk}: ${formatDate(s.startDate)} - ${formatDate(s.endDate)}`;
}

function getNextFourWeekIds(): string[] {
  const base = getNextWeekId(getCurrentWeekId());
  const ids: string[] = [base];
  for (let i = 0; i < 3; i++) ids.push(getNextWeekId(ids[ids.length - 1]));
  return ids;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

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
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  return { toasts, show };
}

// ─── Per-schedule stats ───────────────────────────────────────────────────────

interface ScheduleStats {
  staffed: number;
  total: number;
  constraints: number;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  published: 'פורסם',
  draft: 'טיוטה',
  archived: 'ארכיון',
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'published') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold w-fit border border-blue-200">
        <span className="w-2 h-2 rounded-full bg-[#056AE5]" />
        {STATUS_LABELS[status]}
      </span>
    );
  }
  if (status === 'draft') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-surface-variant text-on-surface-variant text-xs font-semibold w-fit border border-outline-variant">
        <span className="w-2 h-2 rounded-full bg-outline" />
        {STATUS_LABELS[status]}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-surface-dim text-on-surface-variant text-xs font-semibold w-fit border border-outline-variant/50">
      <span className="w-2 h-2 rounded-full bg-on-surface-variant/40" />
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Action icon button ───────────────────────────────────────────────────────

function ActionBtn({
  icon,
  title,
  onClick,
  variant = 'default',
  disabled,
}: {
  icon: string;
  title: string;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
}) {
  const base = 'p-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const cls =
    variant === 'primary'
      ? `${base} text-[#056AE5] bg-blue-100 hover:bg-blue-200`
      : variant === 'danger'
        ? `${base} text-error hover:bg-error/10`
        : `${base} text-outline hover:bg-surface-variant hover:text-primary`;

  return (
    <button className={cls} title={title} onClick={onClick} disabled={disabled}>
      <MaterialIcon name={icon} />
    </button>
  );
}

// ─── Schedule card ────────────────────────────────────────────────────────────

interface ScheduleCardProps {
  schedule: Schedule;
  stats?: ScheduleStats;
  onPublish: (s: Schedule) => void;
  onDelete: (s: Schedule) => void;
  onClone: (s: Schedule) => void;
  onView: (s: Schedule) => void;
  onExport: () => void;
}

function ScheduleCard({
  schedule,
  stats,
  onPublish,
  onDelete,
  onClone,
  onView,
  onExport,
}: ScheduleCardProps) {
  const { status } = schedule;

  const cardCls =
    status === 'published'
      ? 'border-2 border-[#056AE5] shadow-[0px_4px_16px_0px_rgba(5,106,229,0.18)]'
      : status === 'archived'
        ? 'border border-outline-variant/50 opacity-70 hover:opacity-100 transition-opacity bg-surface-container'
        : 'border border-outline-variant';

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-lg flex flex-col justify-between h-[180px] relative overflow-hidden ${cardCls}`}
    >
      {status === 'published' && (
        <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-l from-[#101B79] to-[#056AE5]" />
      )}

      <div className="flex flex-col gap-1">
        <StatusBadge status={status} />
        <h3 className="font-semibold text-base text-on-surface mt-1">{weekLabel(schedule)}</h3>
      </div>

      <div className="flex items-center justify-between border-t border-outline-variant/30 pt-sm mt-auto">
        <div className="flex gap-lg">
          <div className="flex flex-col">
            <span className="font-bold text-sm text-on-surface">
              {stats ? `${stats.staffed}/${stats.total}` : '—'}
            </span>
            <span className="text-xs text-on-surface-variant">משמרות מאוישות</span>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm text-on-surface">
              {stats ? stats.constraints : '—'}
            </span>
            <span className="text-xs text-on-surface-variant">אילוצים שטופלו</span>
          </div>
        </div>

        <div className="flex gap-1">
          {status === 'published' && (
            <>
              <ActionBtn icon="visibility" title="צפייה ועריכה" onClick={() => onView(schedule)} />
              <ActionBtn icon="file_copy" title="שכפול" onClick={() => onClone(schedule)} />
              <ActionBtn icon="download" title="ייצוא" onClick={onExport} />
            </>
          )}
          {status === 'draft' && (
            <>
              <ActionBtn
                icon="send"
                title="פרסום"
                variant="primary"
                onClick={() => onPublish(schedule)}
              />
              <ActionBtn icon="edit" title="עריכה" onClick={() => onView(schedule)} />
              <ActionBtn
                icon="delete"
                title="מחיקה"
                variant="danger"
                onClick={() => onDelete(schedule)}
              />
            </>
          )}
          {status === 'archived' && (
            <>
              <ActionBtn icon="visibility" title="צפייה" onClick={() => onView(schedule)} />
              <ActionBtn icon="file_copy" title="שכפול" onClick={() => onClone(schedule)} />
              <ActionBtn icon="download" title="ייצוא" onClick={onExport} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirmation ──────────────────────────────────────────────────────

function DeleteDialog({
  schedule,
  onConfirm,
  onCancel,
}: {
  schedule: Schedule;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-xl w-full max-w-sm mx-4 flex flex-col gap-md">
        <div className="flex items-center gap-sm text-error">
          <MaterialIcon name="warning" />
          <h2 className="font-bold text-lg">מחיקת סידור</h2>
        </div>
        <p className="text-on-surface-variant text-sm">
          בטוח/ה שברצונך למחוק את <strong>{weekLabel(schedule)}</strong>? לא ניתן לבטל פעולה זו.
        </p>
        <div className="flex gap-sm justify-end">
          <button
            onClick={onCancel}
            className="px-md py-sm rounded-lg border border-outline-variant text-on-surface hover:bg-surface-variant transition-colors text-sm font-semibold"
          >
            ביטול
          </button>
          <button
            onClick={onConfirm}
            className="px-md py-sm rounded-lg bg-error text-white hover:bg-red-700 transition-colors text-sm font-semibold"
          >
            מחק
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create new schedule modal ────────────────────────────────────────────────

function CreateModal({
  existingWeekIds,
  onClose,
  onCreated,
  onNavigate,
  showToast,
  preselectedWeekId,
}: {
  existingWeekIds: Set<string>;
  onClose: () => void;
  onCreated: (s: Schedule) => void;
  onNavigate: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  preselectedWeekId?: string;
}) {
  const suggestions = getNextFourWeekIds().filter((w) => !existingWeekIds.has(w));
  const [selectedWeekId, setSelectedWeekId] = useState(
    preselectedWeekId ?? suggestions[0] ?? getCurrentWeekId()
  );
  const [customWeekId, setCustomWeekId] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [loading, setLoading] = useState(false);

  const effectiveWeekId = useCustom ? customWeekId.trim() : selectedWeekId;

  async function handleCreate(autoGenerate: boolean) {
    if (!effectiveWeekId) return;
    setLoading(true);
    try {
      if (autoGenerate) {
        await scheduleApi.generate(effectiveWeekId);
        showToast('הסידור נוצר ונוצרו משמרות ושיבוצים אוטומטית', 'success');
        navigate(`/schedules/${effectiveWeekId}`);
      } else {
        await adminApi.initialize(effectiveWeekId);
        showToast('טיוטת סידור נוצרה בהצלחה', 'success');
        // Navigate to the newly created schedule board
        navigate(`/schedules/${effectiveWeekId}`);
      }
    } catch (err: any) {
      if (err instanceof Error && err.message.includes('409') || (err.message && err.message.includes('already exists'))) {
        showToast('טיוטה זו כבר אותחלה בעבר.', 'error');
      } else {
        showToast(err instanceof Error ? err.message : 'שגיאה ביצירת הסידור', 'error');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-xl w-full max-w-md mx-4 flex flex-col gap-md">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-xl text-[#101B79]">יצירת סידור חדש</h2>
          <button onClick={onClose} className="text-outline hover:text-on-surface transition-colors">
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="flex flex-col gap-sm">
          <label className="text-sm font-semibold text-on-surface-variant">בחר שבוע</label>
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-2">
              {suggestions.map((wId) => (
                <label
                  key={wId}
                  className={`flex items-center gap-sm p-sm rounded-lg border cursor-pointer transition-colors ${
                    !useCustom && selectedWeekId === wId
                      ? 'border-[#056AE5] bg-blue-50'
                      : 'border-outline-variant hover:bg-surface-container-low'
                  }`}
                >
                  <input
                    type="radio"
                    name="weekId"
                    value={wId}
                    checked={!useCustom && selectedWeekId === wId}
                    onChange={() => {
                      setSelectedWeekId(wId);
                      setUseCustom(false);
                    }}
                    className="accent-[#056AE5]"
                  />
                  <span className="text-sm font-medium text-on-surface">
                    שבוע {parseWeekNumber(wId)} ({wId})
                  </span>
                </label>
              ))}
            </div>
          )}

          <label
            className={`flex items-center gap-sm p-sm rounded-lg border cursor-pointer transition-colors ${
              useCustom
                ? 'border-[#056AE5] bg-blue-50'
                : 'border-outline-variant hover:bg-surface-container-low'
            }`}
          >
            <input
              type="radio"
              name="weekId"
              checked={useCustom}
              onChange={() => setUseCustom(true)}
              className="accent-[#056AE5]"
            />
            <span className="text-sm font-medium text-on-surface">שבוע מותאם אישית</span>
          </label>
          {useCustom && (
            <input
              type="text"
              placeholder="לדוגמה: 2026-W22"
              value={customWeekId}
              onChange={(e) => setCustomWeekId(e.target.value)}
              className="w-full px-md py-sm border border-outline-variant rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#056AE5] focus:border-[#056AE5]"
            />
          )}
        </div>

        <div className="flex flex-col gap-sm pt-sm border-t border-outline-variant/30">
          <button
            onClick={() => handleCreate(true)}
            disabled={loading || !effectiveWeekId}
            className="w-full py-sm px-md rounded-lg bg-[#101B79] text-white font-bold text-sm hover:bg-[#0c1461] transition-colors disabled:opacity-50 flex items-center justify-center gap-xs"
          >
            {loading ? (
              <span className="animate-spin">
                <MaterialIcon name="progress_activity" />
              </span>
            ) : (
              <MaterialIcon name="auto_awesome" />
            )}
            יצירה אוטומטית (CSP)
          </button>
          <button
            onClick={() => handleCreate(false)}
            disabled={loading || !effectiveWeekId}
            className="w-full py-sm px-md rounded-lg border border-outline-variant text-on-surface font-semibold text-sm hover:bg-surface-container-low transition-colors disabled:opacity-50"
          >
            צור טיוטה בלבד
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toast renderer ───────────────────────────────────────────────────────────

function ToastStack({ toasts }: { toasts: ToastMsg[] }) {
  const colors: Record<string, string> = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-[#101B79]',
  };
  return (
    <div className="fixed bottom-24 left-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${colors[t.type]} text-white text-sm font-semibold px-md py-sm rounded-lg shadow-xl`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const navigate = useNavigate();
  const { toasts, show: showToast } = useToast();

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [statsMap, setStatsMap] = useState<Map<string, ScheduleStats>>(new Map());
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<'all' | 'current' | 'last'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'archived'>(
    'all'
  );

  const [confirmDelete, setConfirmDelete] = useState<Schedule | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [clonePreselect, setClonePreselect] = useState<string | undefined>();

  // ── Load schedules (runs once on mount; actions use optimistic updates) ──

  useEffect(() => {
    scheduleApi
      .getAll()
      .then(({ schedules: all }) => {
        setSchedules(all);
        all.forEach((s) => {
          Promise.all([
            shiftApi.getBySchedule(s._id),
            constraintApi.getAllConstraints(s.weekId),
          ])
            .then(([shiftsRes, constraintsRes]) => {
              const staffed = shiftsRes.shifts.filter((sh) => sh.status === 'filled').length;
              setStatsMap((prev) =>
                new Map(prev).set(s._id, {
                  staffed,
                  total: shiftsRes.shifts.length,
                  constraints: constraintsRes.constraints.length,
                })
              );
            })
            .catch(() => {
              setStatsMap((prev) =>
                new Map(prev).set(s._id, { staffed: 0, total: 0, constraints: 0 })
              );
            });
        });
      })
      .catch((err: unknown) => {
        showToast(err instanceof Error ? err.message : 'שגיאה בטעינת הסידורים', 'error');
      })
      .finally(() => setLoading(false));
  }, [showToast]);

  // ── Filter ──

  function inDateRange(s: Schedule): boolean {
    if (dateRange === 'all') return true;
    const now = new Date();
    const start = new Date(s.startDate);
    if (dateRange === 'current') {
      return start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear();
    }
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return (
      start.getMonth() === lastMonth.getMonth() &&
      start.getFullYear() === lastMonth.getFullYear()
    );
  }

  const filtered = schedules.filter((s) => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (!inDateRange(s)) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!weekLabel(s).toLowerCase().includes(q) && !s.weekId.toLowerCase().includes(q))
        return false;
    }
    return true;
  });

  // ── Actions ──

  async function handlePublish(s: Schedule) {
    try {
      const { schedule } = await scheduleApi.update(s._id, 'published');
      setSchedules((prev) => prev.map((x) => (x._id === s._id ? schedule : x)));
      showToast('הסידור פורסם בהצלחה', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'שגיאה בפרסום', 'error');
    }
  }

  async function handleDelete(s: Schedule) {
    try {
      await scheduleApi.deleteSchedule(s._id);
      setSchedules((prev) => prev.filter((x) => x._id !== s._id));
      showToast('הסידור נמחק', 'info');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'שגיאה במחיקה', 'error');
    } finally {
      setConfirmDelete(null);
    }
  }

  async function handleClone(s: Schedule) {
    const targetWeekId = getNextWeekId(s.weekId);
    try {
      const { schedule } = await scheduleApi.clone(s._id, targetWeekId);
      setSchedules((prev) => [schedule, ...prev]);
      showToast(`סידור שוכפל לשבוע ${parseWeekNumber(targetWeekId)}`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'שגיאה בשכפול', 'error');
    }
  }

  const existingWeekIds = new Set(schedules.map((s) => s.weekId));

  return (
    <MainLayout
      title="סידורי עבודה"
      subtitle={`${schedules.length} סידורים`}
      actions={
        <button
          onClick={() => {
            setClonePreselect(undefined);
            setShowCreate(true);
          }}
          className="hidden md:flex items-center gap-xs px-md py-sm rounded-lg bg-[#101B79] text-white font-bold text-sm hover:bg-[#0c1461] transition-colors shadow-sm"
        >
          <MaterialIcon name="add" />
          סידור חדש
        </button>
      }
    >
      {/* Page header */}
      <div className="flex flex-col gap-xs mb-xl">
        <h1 className="text-2xl font-black text-[#101B79]">סידורי עבודה קיימים</h1>
        <p className="text-sm text-on-surface-variant">
          ניהול, צפייה ועריכה של משמרות העובדים במערכת.
        </p>
      </div>

      {/* Filter bar */}
      <div className="bg-surface-container-low rounded-xl p-md shadow-sm border border-outline-variant flex flex-col md:flex-row gap-md items-end mb-xl">
        <div className="flex-1 w-full flex flex-col gap-1">
          <label className="text-xs text-on-surface-variant font-semibold">חיפוש מהיר</label>
          <div className="relative w-full">
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-outline">
              <MaterialIcon name="search" />
            </div>
            <input
              type="text"
              placeholder="חיפוש לפי שבוע או תאריך..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-3 py-2 border border-outline-variant rounded-lg bg-white text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-[#056AE5] focus:border-[#056AE5] shadow-sm"
            />
          </div>
        </div>

        <div className="w-full md:w-44 flex flex-col gap-1">
          <label className="text-xs text-on-surface-variant font-semibold">טווח תאריכים</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
            className="w-full px-3 py-2 border border-outline-variant rounded-lg bg-white text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-[#056AE5] shadow-sm"
          >
            <option value="all">הכל</option>
            <option value="current">החודש הנוכחי</option>
            <option value="last">חודש שעבר</option>
          </select>
        </div>

        <div className="w-full md:w-44 flex flex-col gap-1">
          <label className="text-xs text-on-surface-variant font-semibold">סטטוס</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full px-3 py-2 border border-outline-variant rounded-lg bg-white text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-[#056AE5] shadow-sm"
          >
            <option value="all">הכל</option>
            <option value="published">פורסם</option>
            <option value="draft">טיוטה</option>
            <option value="archived">ארכיון</option>
          </select>
        </div>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-on-surface-variant">
          <div className="flex flex-col items-center gap-sm">
            <span className="animate-spin text-[#056AE5]">
              <MaterialIcon name="progress_activity" />
            </span>
            <span className="text-sm">טוען סידורים...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-sm text-on-surface-variant">
          <MaterialIcon name="calendar_month" />
          <p className="text-sm">לא נמצאו סידורים התואמים את הסינון</p>
          <button
            onClick={() => {
              setSearch('');
              setDateRange('all');
              setStatusFilter('all');
            }}
            className="text-xs text-[#056AE5] hover:underline"
          >
            נקה סינון
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          {filtered.map((s) => (
            <ScheduleCard
              key={s._id}
              schedule={s}
              stats={statsMap.get(s._id)}
              onPublish={handlePublish}
              onDelete={(sched) => setConfirmDelete(sched)}
              onClone={handleClone}
              onView={(sched) => navigate(`/schedules/${sched.weekId}`)}
              onExport={() => showToast('ייצוא Excel/PDF בקרוב...', 'info')}
            />
          ))}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => {
          setClonePreselect(undefined);
          setShowCreate(true);
        }}
        className="fixed bottom-lg left-lg bg-[#101B79] text-white font-bold py-sm px-lg rounded-full shadow-[0px_8px_24px_rgba(16,27,121,0.3)] hover:scale-105 active:scale-95 transition-all flex items-center gap-xs z-40 text-sm"
      >
        <MaterialIcon name="add" />
        יצירת סידור חדש
      </button>

      {/* Modals */}
      {confirmDelete && (
        <DeleteDialog
          schedule={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}

      {showCreate && (
        <CreateModal
          existingWeekIds={existingWeekIds}
          onClose={() => setShowCreate(false)}
          onCreated={(s) => setSchedules((prev) => [s, ...prev])}
          onNavigate={() => navigate('/admin')}
          showToast={showToast}
          preselectedWeekId={clonePreselect}
        />
      )}

      <ToastStack toasts={toasts} />
    </MainLayout>
  );
}
