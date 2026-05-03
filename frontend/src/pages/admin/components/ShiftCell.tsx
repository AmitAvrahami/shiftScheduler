import type { AdminDashboardDTO, ShiftType } from '../types';
import {
  getShiftFillStatus,
  getShiftTypeLabel,
  type ShiftFillStatus,
} from '../utils/scheduleBoardUtils';

type AdminDashboardShift = AdminDashboardDTO['shifts'][number];
type AdminDashboardAssignment = AdminDashboardDTO['assignments'][number];
type AdminDashboardEmployee = AdminDashboardDTO['employees'][number];

export interface ShiftCellProps {
  shift?: AdminDashboardShift;
  assignments: AdminDashboardAssignment[];
  employees: AdminDashboardEmployee[];
  shiftType: ShiftType;
  onShiftClick?: (shiftId: string) => void;
  onAssignEmployee?: (shiftId: string) => void;
  onRemoveEmployee?: (assignmentId: string) => void;
}

const STATUS_CLASSES: Record<ShiftFillStatus, string> = {
  full: 'border-emerald-200 bg-emerald-50/70 text-emerald-950',
  partial: 'border-amber-200 bg-amber-50/80 text-amber-950',
  empty: 'border-red-200 bg-red-50/80 text-red-950',
  unknown: 'border-slate-200 bg-slate-50/80 text-slate-500',
};

const STATUS_BADGE_CLASSES: Record<ShiftFillStatus, string> = {
  full: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  empty: 'bg-red-100 text-red-700',
  unknown: 'bg-slate-100 text-slate-500',
};

export function ShiftCell({
  shift,
  assignments,
  employees,
  shiftType,
  onShiftClick,
  onAssignEmployee,
  onRemoveEmployee,
}: ShiftCellProps) {
  const status = getShiftFillStatus(shift, assignments);
  const requiredCount = Math.max(0, shift?.requiredEmployees ?? 0);
  const assignedCount = assignments.length;
  const missingCount = Math.max(0, requiredCount - assignedCount);
  const shiftLabel = getShiftTypeLabel(shift?.type ?? shiftType);
  const canInteractWithShift = Boolean(shift && onShiftClick);
  const canAssignEmployee = Boolean(shift && onAssignEmployee);

  if (!shift) {
    return (
      <div
        className={`min-h-36 rounded-lg border border-dashed p-3 ${STATUS_CLASSES.unknown}`}
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-600">{shiftLabel}</div>
            <div className="mt-1 text-xs text-slate-400">לא הוגדרה משמרת</div>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-bold ${STATUS_BADGE_CLASSES.unknown}`}>
            חסר
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-36 rounded-lg border p-3 shadow-sm transition ${STATUS_CLASSES[status]} ${
        canInteractWithShift ? 'cursor-pointer hover:shadow-md' : ''
      }`}
      dir="rtl"
      role={canInteractWithShift ? 'button' : undefined}
      tabIndex={canInteractWithShift ? 0 : undefined}
      onClick={() => onShiftClick?.(shift.id)}
      onKeyDown={(event) => {
        if (!canInteractWithShift) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onShiftClick?.(shift.id);
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold">{shiftLabel}</div>
          <div className="mt-1 text-xs opacity-75">
            {assignedCount}/{requiredCount} משובצים
          </div>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-bold ${STATUS_BADGE_CLASSES[status]}`}>
          {getStatusLabel(status)}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {employees.length > 0 ? (
          employees.map(employee => {
            const assignment = assignments.find(item => item.employeeId === employee.id);

            return (
              <div
                key={`${shift.id}-${employee.id}`}
                className="flex items-center justify-between gap-2 rounded-md border border-white/70 bg-white/75 px-2 py-1.5 text-sm text-slate-700"
              >
                <span className="truncate font-medium">{employee.name}</span>
                {assignment && onRemoveEmployee && (
                  <button
                    type="button"
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-red-600"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveEmployee(assignment.id);
                    }}
                  >
                    הסר
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div className="rounded-md border border-dashed border-current/20 bg-white/50 px-2 py-3 text-center text-xs font-medium opacity-70">
            אין עובדים משובצים
          </div>
        )}

        {Array.from({ length: missingCount }).map((_, index) => (
          <button
            key={`${shift.id}-missing-${index}`}
            type="button"
            disabled={!canAssignEmployee}
            className="flex w-full items-center justify-center rounded-md border border-dashed border-red-300 bg-white/70 px-2 py-2 text-xs font-bold text-red-600 transition enabled:hover:bg-red-100 disabled:cursor-default"
            onClick={(event) => {
              event.stopPropagation();
              onAssignEmployee?.(shift.id);
            }}
          >
            חסר עובד
          </button>
        ))}
      </div>
    </div>
  );
}

function getStatusLabel(status: ShiftFillStatus): string {
  switch (status) {
    case 'full':
      return 'מלא';
    case 'partial':
      return 'חסר';
    case 'empty':
      return 'ריק';
    case 'unknown':
      return 'לא ידוע';
  }
}
