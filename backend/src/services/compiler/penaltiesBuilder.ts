import type { Constraint, PenaltyTermDTO, RelaxationWeightsDTO } from '../../types/constraint';
import { isSoftConstraint, RELAXATION_WEIGHTS } from '../../types/constraint';

/**
 * Translate soft constraints into objective-function penalty terms.
 *
 * PR #2 produces no soft constraints upstream (the normalizer only emits
 * hard availability), so this function returns `[]` for the current input
 * shape. It still iterates the input — exhaustively — so that once PR #3
 * starts emitting soft constraints, the wiring is already in place and the
 * switch will fail loudly on any category we forgot to handle.
 */
export function buildPenalties(constraints: Constraint[]): PenaltyTermDTO[] {
  const out: PenaltyTermDTO[] = [];

  for (const constraint of constraints) {
    if (!isSoftConstraint(constraint)) continue;

    const category = constraint.category;
    switch (category) {
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
