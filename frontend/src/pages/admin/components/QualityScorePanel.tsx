import MaterialIcon from '../../../components/MaterialIcon';
import type { GenerationScore } from '../../../lib/api';
import { getPenaltyCategoryLabel, getSortedPenaltyBreakdown } from '../utils/penaltyLabels';

interface QualityScorePanelProps {
  score?: GenerationScore | null;
  compact?: boolean;
  className?: string;
}

export function QualityScorePanel({ score, compact = false, className = '' }: QualityScorePanelProps) {
  if (!score) return null;

  const breakdown = getSortedPenaltyBreakdown(score.breakdown);
  const generatedAt = score.generatedAt ? new Date(score.generatedAt) : null;
  const generatedAtLabel =
    generatedAt && !Number.isNaN(generatedAt.getTime())
      ? generatedAt.toLocaleString('he-IL', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  return (
    <div
      className={`bg-white border border-[#e2e8f0] rounded-xl shadow-bezeq-card ${
        compact ? 'p-3' : 'p-4'
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 shrink-0">
            <MaterialIcon name="analytics" className="text-[16px] text-[#056AE5]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-800">איכות סידור</div>
            <div className="text-[10px] font-medium text-slate-500">נמוך יותר = טוב יותר</div>
          </div>
        </div>
        {generatedAtLabel && (
          <span className="text-[10px] font-medium text-slate-400 shrink-0">{generatedAtLabel}</span>
        )}
      </div>

      <div className="rounded-xl p-3 bg-slate-50 border border-slate-100 mb-3">
        <div className="text-2xl font-bold text-slate-800 leading-none">{score.totalPenalty}</div>
        <div className="text-xs text-slate-500 font-medium mt-1">סה״כ קנסות רכים</div>
      </div>

      <div>
        <div className="text-xs font-bold text-slate-700 mb-2">פירוט לפי אילוצים</div>
        {breakdown.length > 0 ? (
          <div className="space-y-2">
            {breakdown.map(([category, value]) => (
              <div key={category} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-600 truncate">{getPenaltyCategoryLabel(category)}</span>
                <span className="font-bold text-slate-800 shrink-0">{value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500">אין קנסות רכים</div>
        )}
      </div>
    </div>
  );
}
