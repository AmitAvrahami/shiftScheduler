import { useDraggable, useDroppable } from '@dnd-kit/core';
import MaterialIcon from '../../../components/MaterialIcon';
import type { GenerateWarning } from '../../../lib/api';
import type { AdminDashboardDTO, ShiftType } from '../types';
import {
  getShiftFillStatus,
  getShiftTypeLabel,
  type ShiftFillStatus,
} from '../utils/scheduleBoardUtils';
import { formatWarningMessage, getWarningLabel, warningCellKey } from '../utils/warningUtils';

type AdminDashboardShift = AdminDashboardDTO['shifts'][number];
type AdminDashboardAssignment = AdminDashboardDTO['assignments'][number];
type AdminDashboardEmployee = AdminDashboardDTO['employees'][number];

export interface ShiftCellProps {
  shift?: AdminDashboardShift;
  assignments: AdminDashboardAssignment[];
  employees: AdminDashboardEmployee[];
  shiftType: ShiftType;
  // Density: 'full' for the editing page, 'compact' for the dashboard preview.
  variant?: 'full' | 'compact';
  // Non-blocking soft-constraint warnings indexed by `${shiftId}|${employeeId}`
  // (PR09). Display-only — never affects assignment or publish behavior.
  warningsByCell?: Map<string, GenerateWarning[]>;
  onShiftClick?: (shiftId: string) => void;
  onAssignEmployee?: (shiftId: string) => void;
  onRemoveEmployee?: (assignmentId: string) => void;
  dragDisabled?: boolean;
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
  variant = 'full',
  warningsByCell,
  onShiftClick,
  onAssignEmployee,
  onRemoveEmployee,
  dragDisabled = false,
}: ShiftCellProps) {
  const droppable = useDroppable({
    id: shift?.id ?? '__no_shift__',
    disabled: !shift || dragDisabled,
  });
  const status = getShiftFillStatus(shift, assignments);
  const requiredCount = Math.max(0, shift?.requiredEmployees ?? 0);
  const assignedCount = assignments.length;
  const missingCount = Math.max(0, requiredCount - assignedCount);
  const shiftLabel = getShiftTypeLabel(shift?.type ?? shiftType);
  const canInteractWithShift = Boolean(shift && onShiftClick);
  const canAssignEmployee = Boolean(shift && onAssignEmployee);

  // Static class strings selected by density (not constructed) so Tailwind emits them.
  const isCompact = variant === 'compact';
  const cellPad = isCompact ? 'min-h-24 p-2' : 'min-h-36 p-3';
  const headerGap = isCompact ? 'gap-1.5' : 'gap-3';
  const labelText = isCompact ? 'text-xs' : 'text-sm';
  const subText = isCompact ? 'text-[10px]' : 'text-xs';
  const badgeClass = isCompact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs';
  const listClass = isCompact ? 'mt-2 space-y-1' : 'mt-3 space-y-2';
  const rowClass = isCompact ? 'px-1.5 py-1 text-xs' : 'px-2 py-1.5 text-sm';
  const emptyClass = isCompact ? 'py-2 text-[10px]' : 'py-3 text-xs';
  const missingClass = isCompact ? 'py-1.5 text-[10px]' : 'py-2 text-xs';

  if (!shift) {
    return (
      <div
        className={`${cellPad} rounded-lg border border-dashed ${STATUS_CLASSES.unknown}`}
        dir="rtl"
      >
        <div className={`flex items-start justify-between ${headerGap}`}>
          <div className="min-w-0">
            <div className={`${labelText} font-bold text-slate-600 truncate`}>{shiftLabel}</div>
            <div className={`mt-1 ${subText} text-slate-400`}>לא הוגדרה משמרת</div>
          </div>
          <span
            className={`shrink-0 rounded-full ${badgeClass} font-bold ${STATUS_BADGE_CLASSES.unknown}`}
          >
            חסר
          </span>
        </div>
      </div>
    );
  }

  /* eslint-disable react-hooks/refs -- dnd-kit's useDroppable returns non-ref props (isOver, setNodeRef callback) that the v7 rule flags by name. */
  const dropRing = droppable.isOver ? 'ring-2 ring-[#056AE5] ring-offset-1' : '';

  return (
    <div
      ref={droppable.setNodeRef}
      className={`${cellPad} rounded-lg border shadow-sm transition ${STATUS_CLASSES[status]} ${
        canInteractWithShift ? 'cursor-pointer hover:shadow-md' : ''
      } ${dropRing}`}
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
      <div className={`flex items-start justify-between ${headerGap}`}>
        <div className="min-w-0">
          <div className={`${labelText} font-bold truncate`}>{shiftLabel}</div>
          <div className={`mt-1 ${subText} opacity-75`}>
            {assignedCount}/{requiredCount} משובצים
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full ${badgeClass} font-bold ${STATUS_BADGE_CLASSES[status]}`}
        >
          {getStatusLabel(status)}
        </span>
      </div>

      <div className={listClass}>
        {employees.length > 0 ? (
          employees.map((employee) => {
            const assignment = assignments.find((item) => item.employeeId === employee.id);
            const cellWarnings = warningsByCell?.get(warningCellKey(shift.id, employee.id));
            const nameById = new Map([[employee.id, employee.name]]);
            const warningTooltip = cellWarnings
              ?.map((warning) => {
                const label = getWarningLabel(warning);
                return label === warning.message ? formatWarningMessage(warning, nameById) : label;
              })
              .join(' · ');

            return (
              <DraggableChip
                key={`${shift.id}-${employee.id}`}
                shiftId={shift.id}
                employeeId={employee.id}
                employeeName={employee.name}
                assignmentId={assignment?.id}
                warningTooltip={warningTooltip}
                rowClass={rowClass}
                onRemoveEmployee={assignment && onRemoveEmployee ? onRemoveEmployee : undefined}
                dragDisabled={dragDisabled}
              />
            );
          })
        ) : (
          <div
            className={`rounded-md border border-dashed border-current/20 bg-white/50 px-2 ${emptyClass} text-center font-medium opacity-70`}
          >
            אין עובדים משובצים
          </div>
        )}

        {Array.from({ length: missingCount }).map((_, index) => (
          <button
            key={`${shift.id}-missing-${index}`}
            type="button"
            disabled={!canAssignEmployee}
            className={`flex w-full items-center justify-center rounded-md border border-dashed border-red-300 bg-white/70 px-2 ${missingClass} font-bold text-red-600 transition enabled:hover:bg-red-100 disabled:cursor-default`}
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

interface DraggableChipProps {
  shiftId: string;
  employeeId: string;
  employeeName: string;
  assignmentId?: string;
  warningTooltip?: string;
  rowClass: string;
  onRemoveEmployee?: (assignmentId: string) => void;
  dragDisabled: boolean;
}

function DraggableChip({
  shiftId,
  employeeId,
  employeeName,
  assignmentId,
  warningTooltip,
  rowClass,
  onRemoveEmployee,
  dragDisabled,
}: DraggableChipProps) {
  const draggable = useDraggable({
    id: assignmentId ?? `__no_assignment__${shiftId}_${employeeId}`,
    data: { sourceShiftId: shiftId, employeeId, employeeName },
    disabled: dragDisabled || !assignmentId,
  });

  /* eslint-disable react-hooks/refs -- dnd-kit's useDraggable returns non-ref props (isDragging, attributes, listeners, setNodeRef callback) that the v7 rule flags by name. */
  const dragging = draggable.isDragging;

  return (
    <div
      ref={draggable.setNodeRef}
      {...draggable.attributes}
      {...draggable.listeners}
      className={`flex items-center justify-between gap-2 rounded-md border border-white/70 bg-white/75 ${rowClass} text-slate-700 ${
        dragDisabled || !assignmentId ? '' : 'cursor-grab active:cursor-grabbing'
      } ${dragging ? 'opacity-40' : ''}`}
    >
      <span className="flex min-w-0 items-center gap-1">
        {warningTooltip && (
          <span
            className="shrink-0 leading-none"
            role="img"
            title={warningTooltip}
            aria-label={warningTooltip}
          >
            <MaterialIcon name="warning" className="text-amber-500 text-[16px]" />
          </span>
        )}
        <span className="truncate font-medium">{employeeName}</span>
      </span>
      {assignmentId && onRemoveEmployee && (
        <button
          type="button"
          className="shrink-0 rounded-md px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-red-600"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRemoveEmployee(assignmentId);
          }}
        >
          הסר
        </button>
      )}
    </div>
  );
}
