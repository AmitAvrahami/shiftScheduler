import type { LeanConstraint } from '../solverMapper';
import { toDateKey } from '../../utils/weekUtils';
import type { Constraint, CalendarDateString, HardConstraint } from '../../types/constraint';
import { constraintId, workerId } from '../../types/constraint';

/**
 * Translate Mongo `IConstraint` documents into the domain `Constraint[]`
 * surface introduced in PR #1.
 *
 * Today only one rule travels through Mongo: per-`(date, definitionId)`
 * availability, expressed as `canWork: false` rows. Each such row becomes a
 * single hard `availability` constraint. `canWork: true` rows carry no rule
 * and are skipped here — the legacy adapter still re-emits them on the wire
 * for byte-for-byte compatibility with the current Python payload.
 */
export function normalizeLegacyConstraints(
  constraints: LeanConstraint[],
  weekId: string
): Constraint[] {
  const out: Constraint[] = [];

  for (const c of constraints) {
    const userIdStr = c.userId.toString();

    for (const entry of c.entries) {
      if (entry.canWork) continue;

      const dateKey = toDateKey(entry.date);
      const defIdStr = entry.definitionId.toString();

      const hard: HardConstraint = {
        id: constraintId(`${userIdStr}:${weekId}:${dateKey}:${defIdStr}`),
        kind: 'hard',
        category: 'availability',
        targets: {
          scope: 'all',
          targets: [
            { kind: 'employee', employeeId: workerId(userIdStr) },
            {
              kind: 'slot',
              date: dateKey as CalendarDateString,
              definitionId: defIdStr,
            },
          ],
        },
        source: { type: 'employee', actorId: workerId(userIdStr) },
      };

      out.push(hard);
    }
  }

  return out;
}
