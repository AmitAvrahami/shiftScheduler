import MaterialIcon from '../../../components/MaterialIcon';
import type { ScheduleStats } from '../utils/scheduleStats';

interface DashboardSummaryPanelProps {
  weekNumber: number;
  totalUsers: number;
  stats: ScheduleStats | null;
}

export function DashboardSummaryPanel({
  weekNumber,
  totalUsers,
  stats,
}: DashboardSummaryPanelProps) {
  const STATS = [
    { label: 'סה״כ משמרות', value: stats ? String(stats.total) : '-', color: '#056AE5' },
    { label: 'מלאות', value: stats ? String(stats.filled) : '-', color: '#10b981' },
    { label: 'חלקיות', value: stats ? String(stats.partial) : '-', color: '#f59e0b' },
    { label: 'ריקות', value: stats ? String(stats.empty) : '-', color: '#ef4444' },
  ];

  const scheduleStatusLabel =
    stats?.scheduleStatus === 'published'
      ? 'פורסם'
      : stats?.scheduleStatus === 'draft'
        ? 'טיוטה'
        : stats?.scheduleStatus === 'archived'
          ? 'ארכיון'
          : 'לא נוצר';
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
          {STATS.map((s) => (
            <div key={s.label} className="rounded-xl p-3 bg-slate-50 border border-slate-100">
              <div className="text-xl font-bold mb-0.5" style={{ color: s.color }}>
                {s.value}
              </div>
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
            { label: 'מנוע CSP', status: 'פעיל', ok: true },
            { label: 'לוח שיבוץ', status: scheduleStatusLabel, ok: scheduleStatusOk },
            { label: 'עובדים', status: `${totalUsers} פעילים`, ok: true },
            { label: 'שבוע', status: `שבוע ${weekNumber}`, ok: null },
            { label: 'דדליין', status: 'שני 23:59', ok: null },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-xs text-slate-500">{item.label}</span>
              <span
                className="text-xs font-bold"
                style={{
                  color: item.ok === true ? '#056AE5' : item.ok === false ? '#f87171' : '#94a3b8',
                }}
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
