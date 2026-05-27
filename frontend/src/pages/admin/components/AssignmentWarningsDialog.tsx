import type { CSSProperties } from 'react';
import MaterialIcon from '../../../components/MaterialIcon';
import type { AssignmentWarning } from '../../../utils/assignmentConflicts';

interface AssignmentWarningsDialogProps {
  open: boolean;
  warnings: AssignmentWarning[];
  onCancel: () => void;
  onConfirm: () => void;
}

export function AssignmentWarningsDialog({
  open,
  warnings,
  onCancel,
  onConfirm,
}: AssignmentWarningsDialogProps) {
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
            <h3 className="text-lg font-bold text-slate-800">אזהרות שיבוץ</h3>
            <p className="text-sm text-slate-500">
              נמצאו אזהרות עבור השיבוץ הזה. ניתן לבטל או להמשיך בכל זאת.
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
                <span className="text-[11px] font-bold px-2 py-1 bg-amber-100 text-amber-800 rounded-full">
                  {w.title}
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">{w.explanation}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-4 w-full">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-bold border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-bold bg-[#056AE5] text-white hover:bg-[#0457B8] transition-colors shadow-md"
          >
            שבץ בכל זאת
          </button>
        </div>
      </div>
    </div>
  );
}
