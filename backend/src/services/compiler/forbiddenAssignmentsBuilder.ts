import type { LeanShift, LeanShiftDefinition, LeanUser } from '../solverMapper';
import { toDateKey } from '../../utils/weekUtils';
import type {
  Constraint,
  ForbiddenAssignmentDTO,
  EmployeeTarget,
  SlotTarget,
} from '../../types/constraint';
import { isHardConstraint } from '../../types/constraint';

export interface CompilerContext {
  workers: LeanUser[];
  shifts: LeanShift[];
  shiftDefinitions: LeanShiftDefinition[];
}

/**
 * Expand each hard constraint into the set of `(worker, shift)` cells it
 * forbids.
 *
 * PR #2 only consumes the `availability` category — every other hard rule
 * still lives inside the Python solver. The exhaustive `switch` below throws
 * on any unhandled category so adding HC1 / HC3+ in later PRs cannot silently
 * drop a rule on the floor.
 */
export function buildForbiddenAssignments(
  constraints: Constraint[],
  ctx: CompilerContext
): ForbiddenAssignmentDTO[] {
  const out: ForbiddenAssignmentDTO[] = [];

  // Index shifts by `${dateKey}|${definitionId}` for O(1) slot lookup.
  const shiftsBySlot = new Map<string, LeanShift[]>();
  for (const shift of ctx.shifts) {
    const key = `${toDateKey(shift.date)}|${shift.definitionId.toString()}`;
    const bucket = shiftsBySlot.get(key);
    if (bucket) {
      bucket.push(shift);
    } else {
      shiftsBySlot.set(key, [shift]);
    }
  }

  const knownWorkerIds = new Set(ctx.workers.map((w) => w._id.toString()));

  for (const constraint of constraints) {
    if (!isHardConstraint(constraint)) continue;

    const category = constraint.category;
    switch (category) {
      case 'availability': {
        const employee = constraint.targets.targets.find(
          (t): t is EmployeeTarget => t.kind === 'employee'
        );
        const slot = constraint.targets.targets.find((t): t is SlotTarget => t.kind === 'slot');

        if (!employee || !slot) continue;
        if (!knownWorkerIds.has(employee.employeeId)) continue;

        const slotKey = `${slot.date}|${slot.definitionId}`;
        const matchingShifts = shiftsBySlot.get(slotKey);
        if (!matchingShifts) continue;

        for (const shift of matchingShifts) {
          out.push({
            worker_id: employee.employeeId,
            shift_id: shift._id.toString(),
          });
        }
        break;
      }

      case 'role_restriction':
      case 'fixed_assignment':
      case 'min_rest':
      case 'one_shift_per_day':
      case 'weekly_shift_cap':
      case 'coverage':
        throw new Error(
          `Hard category '${category}' is not yet supported by the Node compiler (still owned by the Python solver).`
        );

      default: {
        const _exhaustive: never = category;
        throw new Error(`Unhandled hard constraint category: ${String(_exhaustive)}`);
      }
    }
  }

  return out;
}
