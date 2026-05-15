import type { LeanConstraint } from '../solverMapper';
import type { SolverAvailabilityEntry } from '../solverClient';
import { toDateKey } from '../../utils/weekUtils';
import type { ForbiddenAssignmentDTO } from '../../types/constraint';

/**
 * Re-emit the legacy `SolverWorker.availability[]` shape from the original
 * Mongo constraint documents.
 *
 * The Python solver still consumes `availability` as a boolean-per-slot list.
 * This adapter keeps the legacy path byte-for-byte identical while the solver
 * also consumes additive generic `forbidden_assignments[]` cells.
 *
 * The `forbidden` argument is accepted for symmetry and future verification —
 * a debug guard could check that every forbidden cell corresponds to a
 * `canWork=false` row — but the wire output is sourced from
 * `originalConstraints` so the comparison stays trivially exact.
 */
export function toLegacyAvailability(
  forbidden: ForbiddenAssignmentDTO[],
  originalConstraints: LeanConstraint[]
): Map<string, SolverAvailabilityEntry[]> {
  void forbidden;

  const map = new Map<string, SolverAvailabilityEntry[]>();

  for (const constraint of originalConstraints) {
    const userIdStr = constraint.userId.toString();
    map.set(
      userIdStr,
      constraint.entries.map((entry) => ({
        date: toDateKey(entry.date),
        definition_id: entry.definitionId.toString(),
        can_work: entry.canWork,
      }))
    );
  }

  return map;
}
