import type { LeanConstraint, LeanShiftDefinition } from '../solverMapper';
import { toDateKey } from '../../utils/weekUtils';
import type {
  Constraint,
  CalendarDateString,
  HardConstraint,
  SoftConstraint,
} from '../../types/constraint';
import { constraintId, workerId } from '../../types/constraint';
import { DEFAULT_SOFT_WEIGHTS } from '../../types/constraint/constraint.weights';
import { classifyAvailabilityAgainstShift } from './availabilityClassifier';

/**
 * Translate Mongo `IConstraint` documents into the domain `Constraint[]`
 * surface introduced in PR #1.
 *
 * Each entry is classified against its shift definition. Three outcomes:
 *
 *  - `'forbidden'`        → emit a hard `availability` constraint (the
 *                           solver treats this cell as `var == 0`).
 *  - `'available'`        → emit nothing.
 *  - `'partial_warning'`  → emit a soft `assignment_preference` constraint
 *                           (the solver pays a penalty if it picks this cell).
 *
 * `canWork: false` keeps its bit-identical behaviour from PR #2: it derives
 * to `'unavailable'` and therefore emits the same hard constraint as before.
 */
export function normalizeLegacyConstraints(
  constraints: LeanConstraint[],
  weekId: string,
  shiftDefinitions: LeanShiftDefinition[]
): Constraint[] {
  const out: Constraint[] = [];
  const defsById = new Map(shiftDefinitions.map((def) => [def._id.toString(), def]));

  for (const c of constraints) {
    const userIdStr = c.userId.toString();

    for (const entry of c.entries) {
      const dateKey = toDateKey(entry.date);
      const defIdStr = entry.definitionId.toString();
      const def = defsById.get(defIdStr);

      // Without a shift definition we cannot compute partial overlap. Fall
      // back to the canWork-only behaviour so an orphaned definitionId does
      // not silently drop a hard block.
      const classification = def
        ? classifyAvailabilityAgainstShift(entry, def)
        : entry.canWork
          ? 'available'
          : 'forbidden';

      if (classification === 'available') continue;

      const id = constraintId(`${userIdStr}:${weekId}:${dateKey}:${defIdStr}`);
      const targets = {
        scope: 'all' as const,
        targets: [
          { kind: 'employee' as const, employeeId: workerId(userIdStr) },
          {
            kind: 'slot' as const,
            date: dateKey as CalendarDateString,
            definitionId: defIdStr,
          },
        ],
      };
      const source = { type: 'employee' as const, actorId: workerId(userIdStr) };

      if (classification === 'forbidden') {
        const hard: HardConstraint = {
          id,
          kind: 'hard',
          category: 'availability',
          targets,
          source,
        };
        out.push(hard);
      } else {
        const soft: SoftConstraint = {
          id,
          kind: 'soft',
          category: 'assignment_preference',
          weight: DEFAULT_SOFT_WEIGHTS.assignment_preference,
          targets,
          source,
        };
        out.push(soft);
      }
    }
  }

  return out;
}
