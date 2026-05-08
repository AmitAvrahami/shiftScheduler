import MaterialIcon from '../../../components/MaterialIcon';
import type { GenerateResult } from '../../../lib/api';

interface GeneratedSchedulePanelProps {
  result: GenerateResult | null;
  onClose: () => void;
}

export function GeneratedSchedulePanel({ result, onClose }: GeneratedSchedulePanelProps) {
  if (!result) return null;

  const statusColor =
    result.status === 'OPTIMAL'
      ? '#10b981'
      : result.status === 'FEASIBLE'
        ? '#f59e0b'
        : result.status === 'RELAXED'
          ? '#f97316'
          : '#ef4444';

  const statusBg =
    result.status === 'OPTIMAL'
      ? 'rgba(16,185,129,0.1)'
      : result.status === 'FEASIBLE'
        ? 'rgba(245,158,11,0.1)'
        : result.status === 'RELAXED'
          ? 'rgba(249,115,22,0.1)'
          : 'rgba(239,68,68,0.1)';

  const statusLabel =
    result.status === 'OPTIMAL'
      ? 'אופטימלי'
      : result.status === 'FEASIBLE'
        ? 'ישים'
        : result.status === 'RELAXED'
          ? 'מרופה'
          : result.status;

  return (
    <div
      className="rounded-2xl p-5 mb-6 shadow-sm bg-white"
      style={{ border: `1px solid ${statusColor}40` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: statusBg }}
          >
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
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors bg-slate-50 hover:bg-slate-100 p-1.5 rounded-md"
        >
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
          <div
            className="text-xl font-bold mb-0.5"
            style={{ color: result.warnings.length ? '#f59e0b' : '#10b981' }}
          >
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
