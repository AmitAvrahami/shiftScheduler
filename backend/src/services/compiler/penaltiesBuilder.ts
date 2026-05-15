import { toDateKey } from '../../utils/weekUtils';
import type {
  Constraint,
  EmployeeTarget,
  PenaltyTermDTO,
  RelaxationWeightsDTO,
  SlotTarget,
} from '../../types/constraint';
import { isSoftConstraint, RELAXATION_WEIGHTS } from '../../types/constraint';
import type { CompilerContext } from './forbiddenAssignmentsBuilder';

/**
 * Translate soft constraints into objective-function penalty terms.
 *
 * `assignment_preference` is intentionally narrow: it only applies to
 * employee-target × slot-target assignment surfaces. Existing aggregate soft
 * categories remain Python-owned and are rejected here until Node can
 * faithfully express their semantics.
 */
export function buildPenalties(constraints: Constraint[], ctx: CompilerContext): PenaltyTermDTO[] {
  const out: PenaltyTermDTO[] = [];

  const shiftsBySlot = new Map<string, typeof ctx.shifts>();
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
    if (!isSoftConstraint(constraint)) continue;

    const category = constraint.category;
    switch (category) {
      case 'assignment_preference': {
        const employees = constraint.targets.targets.filter(
          (t): t is EmployeeTarget => t.kind === 'employee'
        );
        const slots = constraint.targets.targets.filter(
          (t): t is SlotTarget => t.kind === 'slot'
        );

        for (const employee of employees) {
          if (!knownWorkerIds.has(employee.employeeId)) continue;

          for (const slot of slots) {
            const slotKey = `${slot.date}|${slot.definitionId}`;
            const matchingShifts = shiftsBySlot.get(slotKey);
            if (!matchingShifts) continue;

            for (const shift of matchingShifts) {
              out.push({
                worker_id: employee.employeeId,
                shift_id: shift._id.toString(),
                category,
                weight: constraint.weight,
              });
            }
          }
        }
        break;
      }

      case 'shift_balance':
      case 'type_diversity':
      case 'rest_optimisation':
      case 'weekend_balance':
      case 'night_overcap':
      case 'fri_sat_cluster':
        throw new Error(
          `Soft category '${category}' is not yet emitted by the Node compiler (still owned by the Python solver).`
        );

      default: {
        const _exhaustive: never = category;
        throw new Error(`Unhandled soft constraint category: ${String(_exhaustive)}`);
      }
    }
  }

  return out;
}

export function defaultRelaxationWeights(): RelaxationWeightsDTO {
  return {
    load: RELAXATION_WEIGHTS.load,
    coverage: RELAXATION_WEIGHTS.coverage,
  };
}
