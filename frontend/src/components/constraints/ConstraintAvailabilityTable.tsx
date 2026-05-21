import type { AvailabilityType, ConstraintEntry, ShiftDefinition } from '../../types/constraint';
import type { User } from '../../types/auth';
import { AvailabilityCell } from './AvailabilityCell';
import type { PartialValue } from './PartialAvailabilityPopover';

interface ConstraintAvailabilityTableProps {
  employees: User[];
  dayDefs: ShiftDefinition[];
  getEntry: (userId: string, definitionId: string) => ConstraintEntry | undefined;
  isOverrideCell: (userId: string, definitionId: string) => boolean;
  onSetStatus: (
    userId: string,
    def: ShiftDefinition,
    status: AvailabilityType,
    partial?: PartialValue
  ) => void;
}

export function ConstraintAvailabilityTable({
  employees,
  dayDefs,
  getEntry,
  isOverrideCell,
  onSetStatus,
}: ConstraintAvailabilityTableProps) {
  if (dayDefs.length === 0) {
    return (
      <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-8 text-center text-slate-400">
        אין משמרות מוגדרות ליום זה
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-8 text-center text-slate-400">
        לא נמצאו עובדים
      </div>
    );
  }

  return (
    <div className="bg-white shadow-sm rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
      <table className="w-full border-collapse text-right min-w-[640px]">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="p-4 font-bold text-slate-900 border-l border-slate-200 w-48 sticky right-0 bg-slate-50">
              עובד
            </th>
            {dayDefs.map((def) => (
              <th
                key={def._id}
                className="p-4 font-bold text-slate-900 border-l border-slate-200 min-w-[170px]"
              >
                <div className="flex flex-col">
                  <span>{def.name}</span>
                  <span className="text-xs font-normal text-slate-500">
                    {def.startTime} - {def.endTime}
                  </span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr
              key={emp._id}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
            >
              <td className="p-4 border-l border-slate-200 bg-slate-50/30 font-bold text-slate-900 sticky right-0">
                {emp.name}
              </td>
              {dayDefs.map((def) => (
                <td key={def._id} className="p-2 border-l border-slate-100 align-top">
                  <AvailabilityCell
                    def={def}
                    entry={getEntry(emp._id, def._id)}
                    isOverride={isOverrideCell(emp._id, def._id)}
                    onSetStatus={(status, partial) => onSetStatus(emp._id, def, status, partial)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
