import MaterialIcon from '../../../components/MaterialIcon';
import type { AdminDashboardEmployee, AdminDashboardShift } from '../types';
import { getDayLabel, getShiftTypeLabel, type WeekDayKey } from '../utils/scheduleBoardUtils';

export interface ShiftAssignmentModalProps {
  open: boolean;
  shift: AdminDashboardShift | null;
  employees: AdminDashboardEmployee[];
  assignedEmployeeIds: Set<string>;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (userId: string) => void;
}

export function ShiftAssignmentModal({
  open,
  shift,
  employees,
  assignedEmployeeIds,
  busy = false,
  onCancel,
  onConfirm,
}: ShiftAssignmentModalProps) {
  if (!open || !shift) return null;

  const candidates = employees.filter(
    (employee) => employee.isActive && !assignedEmployeeIds.has(employee.id)
  );

  const shiftLabel = getShiftTypeLabel(shift.type);
  const dayLabel = getDayLabel(shift.day as WeekDayKey);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-16 pb-6 px-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[calc(100vh-5rem)]">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-black text-[#000654]">שיבוץ עובד למשמרת</h2>
            <p className="mt-1 text-sm text-slate-500">
              {dayLabel} · {shiftLabel}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-white rounded-full transition-colors"
            aria-label="סגור"
          >
            <MaterialIcon name="close" />
          </button>
        </div>

        <div className="overflow-y-auto p-3">
          {candidates.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              אין עובדים פעילים זמינים לשיבוץ במשמרת זו
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {candidates.map((employee) => (
                <li key={employee.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onConfirm(employee.id)}
                    className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-right transition hover:border-[#056AE5] hover:bg-[#F1F8FF] disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
                  >
                    <span className="font-bold text-slate-800 truncate">{employee.name}</span>
                    <span className="shrink-0 rounded-full bg-[#056AE5] text-white text-xs font-bold px-3 py-1">
                      שבץ
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-all text-sm"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
