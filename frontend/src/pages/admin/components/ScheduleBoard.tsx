import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { GenerateWarning } from '../../../lib/api';
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
import { buildWarningsByCell } from '../utils/warningUtils';

export interface MoveAssignmentArgs {
  sourceAssignmentId: string;
  fromShiftId: string;
  toShiftId: string;
  userId: string;
}

type AdminDashboardShift = AdminDashboardDTO['shifts'][number];
type AdminDashboardAssignment = AdminDashboardDTO['assignments'][number];
type AdminDashboardEmployee = AdminDashboardDTO['employees'][number];

export interface ScheduleBoardProps {
  shifts: AdminDashboardShift[];
  assignments: AdminDashboardAssignment[];
  employees: AdminDashboardEmployee[];
  // Non-blocking soft-constraint warnings from the last generation (PR09).
  warnings?: GenerateWarning[];
  // 'full' is the editing density used by ScheduleBoardPage; 'compact' is a
  // denser read-only preview used inside the dashboard's narrow content column.
  variant?: 'full' | 'compact';
  onShiftClick?: (shiftId: string) => void;
  onAssignEmployee?: (shiftId: string) => void;
  onRemoveEmployee?: (assignmentId: string) => void;
  onMoveAssignment?: (args: MoveAssignmentArgs) => void;
  dragDisabled?: boolean;
}

interface ActiveDrag {
  employeeName: string;
}

export function ScheduleBoard({
  shifts,
  assignments,
  employees,
  warnings,
  variant = 'full',
  onShiftClick,
  onAssignEmployee,
  onRemoveEmployee,
  onMoveAssignment,
  dragDisabled = false,
}: ScheduleBoardProps) {
  const shiftsByDay = groupShiftsByDay(shifts);
  const warningsByCell = buildWarningsByCell(warnings);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { employeeName?: string; sourceShiftId?: string; employeeId?: string }
      | undefined;
    if (data?.employeeName) {
      setActiveDrag({ employeeName: data.employeeName });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    if (!onMoveAssignment) return;
    const { active, over } = event;
    if (!over) return;
    const data = active.data.current as { sourceShiftId?: string; employeeId?: string } | undefined;
    const sourceShiftId = data?.sourceShiftId;
    const userId = data?.employeeId;
    const toShiftId = String(over.id);
    const sourceAssignmentId = String(active.id);
    if (!sourceShiftId || !userId || !toShiftId) return;
    if (sourceShiftId === toShiftId) return;
    onMoveAssignment({ sourceAssignmentId, fromShiftId: sourceShiftId, toShiftId, userId });
  }

  function handleDragCancel() {
    setActiveDrag(null);
  }

  // Full, static class strings (selected, not constructed) so Tailwind's
  // scanner can see every utility it must generate.
  const isCompact = variant === 'compact';
  const gridCols = isCompact
    ? 'grid-cols-[minmax(48px,64px)_repeat(7,minmax(0,1fr))]'
    : 'grid-cols-[minmax(84px,110px)_repeat(7,minmax(0,1fr))]';
  const dayHeaderClass = isCompact ? 'px-1 py-2 text-[11px]' : 'px-3 py-3 text-sm';
  const labelHeaderClass = isCompact ? 'px-1.5 py-2 text-[10px]' : 'px-3 py-3 text-xs';
  const cellWrapClass = isCompact ? 'p-1' : 'p-2';

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <section
        className="rounded-lg border border-slate-200 bg-white shadow-sm"
        dir="rtl"
        aria-label="לוח משמרות שבועי"
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-bold text-slate-900">סידור שבועי</h2>
        </div>

        <div className="overflow-x-auto">
          <div className={`grid ${gridCols} border-b border-slate-200 bg-slate-50`}>
            <div
              className={`border-l border-slate-200 ${labelHeaderClass} font-bold uppercase tracking-wide text-slate-500`}
            >
              משמרת
            </div>
            {WEEK_DAYS_ORDER.map((day) => (
              <div
                key={day}
                className={`border-l border-slate-200 ${dayHeaderClass} text-center font-bold text-slate-800`}
              >
                {getDayLabel(day)}
              </div>
            ))}
          </div>

          {SHIFT_TYPES_ORDER.map((shiftType) => (
            <div
              key={shiftType}
              className={`grid ${gridCols} border-b border-slate-100 last:border-b-0`}
            >
              <ShiftRowHeader shiftType={shiftType} variant={variant} />
              {WEEK_DAYS_ORDER.map((day) => {
                const shift = getShiftForDayAndType(shiftsByDay, day, shiftType);
                const shiftAssignments = shift ? getAssignmentsForShift(assignments, shift.id) : [];
                const assignedEmployees = getEmployeesForAssignments(employees, shiftAssignments);

                return (
                  <div
                    key={`${day}-${shiftType}`}
                    className={`border-l border-slate-100 ${cellWrapClass} align-top min-w-0`}
                  >
                    <ShiftCell
                      shift={shift}
                      assignments={shiftAssignments}
                      employees={assignedEmployees}
                      shiftType={shiftType}
                      variant={variant}
                      warningsByCell={warningsByCell}
                      onShiftClick={onShiftClick}
                      onAssignEmployee={onAssignEmployee}
                      onRemoveEmployee={onRemoveEmployee}
                      dragDisabled={dragDisabled}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <DragOverlay>
        {activeDrag ? (
          <div
            className="pointer-events-none rounded-md border border-[#056AE5] bg-white px-2 py-1.5 text-sm font-bold text-[#010636] shadow-lg"
            dir="rtl"
          >
            {activeDrag.employeeName}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function ShiftRowHeader({
  shiftType,
  variant,
}: {
  shiftType: OrderedShiftType;
  variant: 'full' | 'compact';
}) {
  const isCompact = variant === 'compact';
  return (
    <div
      className={`flex items-center border-l border-slate-200 bg-slate-50 min-w-0 ${
        isCompact ? 'px-2 py-2' : 'px-3 py-3'
      }`}
    >
      <div className="min-w-0">
        <div className={`font-bold text-slate-900 truncate ${isCompact ? 'text-xs' : 'text-sm'}`}>
          {getShiftTypeLabel(shiftType)}
        </div>
        {!isCompact && <div className="mt-1 text-xs text-slate-500">שורת משמרת</div>}
      </div>
    </div>
  );
}

function getShiftForDayAndType(
  shiftsByDay: Record<WeekDayKey, AdminDashboardShift[]>,
  day: WeekDayKey,
  shiftType: OrderedShiftType
): AdminDashboardShift | undefined {
  return shiftsByDay[day].find((shift) => shift.type === shiftType);
}
