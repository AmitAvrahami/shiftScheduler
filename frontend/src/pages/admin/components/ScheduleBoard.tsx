import type { AdminDashboardDTO } from '../types';
import { ShiftCell } from './ShiftCell';
import {
  getAssignmentsForShift,
  getDayLabel,
  getEmployeesForAssignments,
  getShiftTypeLabel,
  groupShiftsByDay,
  SHIFT_TYPES_ORDER,
  WEEK_DAYS_ORDER,
  type OrderedShiftType,
  type WeekDayKey,
} from '../utils/scheduleBoardUtils';

type AdminDashboardShift = AdminDashboardDTO['shifts'][number];
type AdminDashboardAssignment = AdminDashboardDTO['assignments'][number];
type AdminDashboardEmployee = AdminDashboardDTO['employees'][number];

export interface ScheduleBoardProps {
  shifts: AdminDashboardShift[];
  assignments: AdminDashboardAssignment[];
  employees: AdminDashboardEmployee[];
  onShiftClick?: (shiftId: string) => void;
  onAssignEmployee?: (shiftId: string) => void;
  onRemoveEmployee?: (assignmentId: string) => void;
}

export function ScheduleBoard({
  shifts,
  assignments,
  employees,
  onShiftClick,
  onAssignEmployee,
  onRemoveEmployee,
}: ScheduleBoardProps) {
  const shiftsByDay = groupShiftsByDay(shifts);

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white shadow-sm"
      dir="rtl"
      aria-label="לוח משמרות שבועי"
    >
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold text-slate-900">סידור שבועי</h2>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1120px]">
          <div className="grid grid-cols-[120px_repeat(7,minmax(132px,1fr))] border-b border-slate-200 bg-slate-50">
            <div className="border-l border-slate-200 px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              משמרת
            </div>
            {WEEK_DAYS_ORDER.map(day => (
              <div
                key={day}
                className="border-l border-slate-200 px-3 py-3 text-center text-sm font-bold text-slate-800"
              >
                {getDayLabel(day)}
              </div>
            ))}
          </div>

          {SHIFT_TYPES_ORDER.map(shiftType => (
            <div
              key={shiftType}
              className="grid grid-cols-[120px_repeat(7,minmax(132px,1fr))] border-b border-slate-100 last:border-b-0"
            >
              <ShiftRowHeader shiftType={shiftType} />
              {WEEK_DAYS_ORDER.map(day => {
                const shift = getShiftForDayAndType(shiftsByDay, day, shiftType);
                const shiftAssignments = shift
                  ? getAssignmentsForShift(assignments, shift.id)
                  : [];
                const assignedEmployees = getEmployeesForAssignments(employees, shiftAssignments);

                return (
                  <div key={`${day}-${shiftType}`} className="border-l border-slate-100 p-2 align-top">
                    <ShiftCell
                      shift={shift}
                      assignments={shiftAssignments}
                      employees={assignedEmployees}
                      shiftType={shiftType}
                      onShiftClick={onShiftClick}
                      onAssignEmployee={onAssignEmployee}
                      onRemoveEmployee={onRemoveEmployee}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShiftRowHeader({ shiftType }: { shiftType: OrderedShiftType }) {
  return (
    <div className="flex items-center border-l border-slate-200 bg-slate-50 px-3 py-3">
      <div>
        <div className="text-sm font-bold text-slate-900">{getShiftTypeLabel(shiftType)}</div>
        <div className="mt-1 text-xs text-slate-500">שורת משמרת</div>
      </div>
    </div>
  );
}

function getShiftForDayAndType(
  shiftsByDay: Record<WeekDayKey, AdminDashboardShift[]>,
  day: WeekDayKey,
  shiftType: OrderedShiftType,
): AdminDashboardShift | undefined {
  return shiftsByDay[day].find(shift => shift.type === shiftType);
}
