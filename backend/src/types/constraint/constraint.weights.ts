/**
 * Weight model for soft constraints.
 *
 * Soft constraints contribute a non-negative integer cost to the solver's
 * objective function. To avoid accidentally mixing a weight with an unrelated
 * numeric (e.g. a duration in minutes), {@link ConstraintWeight} is a branded
 * `number`: it widens to `number` freely but the compiler refuses the reverse
 * assignment. Construct one with the {@link weight} factory.
 *
 * **Source-of-truth caveat (temporary).** Until PR #2 inverts payload
 * ownership, the values in {@link DEFAULT_SOFT_WEIGHTS} are a *mirror* of the
 * canonical constants in `backend/solver/shift_solver.py` (lines 34–43). At
 * runtime the Python solver still uses its local copy, so editing this file
 * alone changes nothing. PR #2 will start sending these weights on the wire
 * and PR #3 will delete the Python-side constants — at which point the values
 * here become authoritative.
 *
 * @module constraint.weights
 */

import type { SoftConstraintCategory } from './constraint.categories';

/**
 * Branded numeric weight. Always non-negative.
 *
 * Construct via {@link weight}; never with `as ConstraintWeight`.
 */
export type ConstraintWeight = number & { readonly __brand: 'ConstraintWeight' };

/**
 * Construct a {@link ConstraintWeight} from a raw number.
 *
 * Throws on negative values to catch caller mistakes early — the solver
 * treats negative weights as bonuses, which is almost never intended and is
 * not part of the current model.
 *
 * @param value Non-negative weight.
 * @throws RangeError if `value < 0` or is not finite.
 */
export const weight = (value: number): ConstraintWeight => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`ConstraintWeight must be a finite non-negative number, got: ${value}`);
  }
  return value as ConstraintWeight;
};

/**
 * Default penalty weight for each soft category.
 *
 * Mirrors `backend/solver/shift_solver.py`:
 *  - `assignment_preference = 100` (Node domain/compiler-only default)
 *  - `W_SHIFT_BALANCE       = 100`
 *  - `W_TYPE_DIVERSITY      = 200`
 *  - `W_REST_OPTIMISATION   = 150`
 *  - `W_WEEKEND_BALANCE     = 300`
 *  - `W_NIGHT_OVERCAP       = 400`
 *  - `W_FRI_SAT_CLUSTER     = 300`
 *
 * Exhaustive over {@link SoftConstraintCategory} — adding a new soft category
 * without a default here is a TypeScript error.
 */
export const DEFAULT_SOFT_WEIGHTS: Record<SoftConstraintCategory, ConstraintWeight> = {
  assignment_preference: weight(100),
  shift_balance: weight(100),
  type_diversity: weight(200),
  rest_optimisation: weight(150),
  weekend_balance: weight(300),
  night_overcap: weight(400),
  fri_sat_cluster: weight(300),
};

/**
 * Relaxation weights — applied when the solver enters its fallback path
 * because a hard constraint cannot be satisfied. Mirrors `W_RELAXED_LOAD`
 * and `W_RELAXED_COVERAGE` (10_000 each) in `backend/solver/shift_solver.py`.
 *
 * These are intentionally an order of magnitude larger than any soft weight
 * so that the solver always prefers a feasible (even if soft-suboptimal)
 * schedule over an infeasible one.
 */
export const RELAXATION_WEIGHTS: {
  readonly load: ConstraintWeight;
  readonly coverage: ConstraintWeight;
} = {
  load: weight(10_000),
  coverage: weight(10_000),
};
