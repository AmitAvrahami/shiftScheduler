import type { CSSProperties } from 'react';
import type { PublishWarning } from '../../../utils/partialAvailabilityWarnings';
import MaterialIcon from '../../../components/MaterialIcon';

interface PublishWarningsDialogProps {
  open: boolean;
  warnings: PublishWarning[];
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Dialog displaying a list of partial-availability warnings before publishing a schedule.
 *
 * DESIGN PATTERN JUSTIFICATION:
 * Encapsulates the visual state of warning management in Hebrew with an RTL orientation.
 * Fully decoupled from data-fetching and scheduling actions.
 */
export function PublishWarningsDialog({
  open,
  warnings,
  onCancel,
  onConfirm,
}: PublishWarningsDialogProps) {
  if (!open) return null;

  const backdropStyle: CSSProperties = {
    background: 'rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(4px)',
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      style={backdropStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      dir="rtl"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-4 border-b border-slate-100 pb-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <MaterialIcon name="warning" className="text-amber-500 text-[24px]" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">אזהרות פרסום — אילוצי זמינות חלקית</h3>
            <p className="text-sm text-slate-500">
              נמצאו עובדים המשובצים למשמרות שבהן הם זמינים באופן חלקי בלבד.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 pl-2 space-y-3 mb-6 max-h-[50vh]">
          {warnings.map((w, idx) => (
            <div
              key={idx}
              className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 flex flex-col gap-2"
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-800 text-sm">{w.employeeName}</span>
                <span className="text-[11px] font-bold px-2 py-1 bg-amber-100 text-amber-800 rounded-full">
                  זמינות חלקית
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">{w.explanation}</p>
              <div className="flex gap-4 text-[11px] text-slate-500 border-t border-amber-200/30 pt-2 mt-1">
                <span>
                  <strong>משמרת:</strong> {w.shiftName}
                </span>
                <span>
                  <strong>שעות זמינות:</strong> {w.startTime}–{w.endTime}
                </span>
                <span>
                  <strong>חפיפה:</strong> {w.overlapMinutes} דקות
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-4 w-full">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-bold border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
          >
            חזור לעריכה
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-bold bg-[#056AE5] text-white hover:bg-[#0457B8] transition-colors shadow-md"
          >
            פרסם בכל זאת
          </button>
        </div>
      </div>
    </div>
  );
}
