/**
 * Catalog of constraint categories.
 *
 * The ShiftScheduler currently expresses every business rule by hardcoding it
 * in the Python solver (`backend/solver/shift_solver.py`). This file is the
 * first step toward inverting that: it enumerates the categories the solver
 * already implements so future PRs can describe each rule **as data** (a
 * `Constraint` instance) rather than **as code** (a Python `if` block).
 *
 * Two top-level kinds:
 *  - `hard` — must hold; violation makes the schedule infeasible (or triggers
 *    the solver's relaxation path).
 *  - `soft` — may be violated; each violation contributes a penalty weight
 *    to the objective function.
 *
 * The category strings here are **stable identifiers** — they will appear on
 * the wire (PR #2 DTOs) and in Mongo documents (PR #3). Renaming a category
 * after this PR ships is a breaking change.
 *
 * @module constraint.categories
 */

/** The two top-level kinds of constraint. Discriminant for {@link Constraint}. */
export type ConstraintKind = 'hard' | 'soft';

/**
 * Hard constraint categories — mirror the solver's HC1–HC7 rules.
 *
 * Mapping (current implementation in `backend/solver/shift_solver.py`):
 *  - `min_rest`           → HC1 (≥480 min between consecutive shifts)
 *  - `availability`       → HC2 (employee declared canWork=false)
 *  - `role_restriction`   → HC3 (managers: morning only, no weekends)
 *  - `fixed_assignment`   → HC4 (fixed-morning employee always assigned Sun–Thu)
 *  - `one_shift_per_day`  → HC5 (a worker holds at most one shift per day)
 *  - `weekly_shift_cap`   → HC6 (≤6 shifts per worker per week)
 *  - `coverage`           → HC7 (each shift slot meets its `requiredCount`)
 */
export type HardConstraintCategory =
  | 'availability'
  | 'role_restriction'
  | 'fixed_assignment'
  | 'min_rest'
  | 'one_shift_per_day'
  | 'weekly_shift_cap'
  | 'coverage';

/**
 * Soft constraint categories — mirror the solver's weighted penalty terms.
 *
 * Mapping (current weights in `backend/solver/shift_solver.py` lines 34–39,
 * mirrored in {@link DEFAULT_SOFT_WEIGHTS}):
 *  - `shift_balance`     → load deviation from team average
 *  - `type_diversity`    → >60% same shift type
 *  - `rest_optimisation` → afternoon→morning gap <16h (still ≥8h)
 *  - `weekend_balance`   → >avg+2 weekend shifts
 *  - `night_overcap`     → >2 night shifts in a week
 *  - `fri_sat_cluster`   → both Friday AND Saturday in the same week
 */
export type SoftConstraintCategory =
  | 'shift_balance'
  | 'type_diversity'
  | 'rest_optimisation'
  | 'weekend_balance'
  | 'night_overcap'
  | 'fri_sat_cluster';

/** Union of every recognised category, regardless of kind. */
export type ConstraintCategory = HardConstraintCategory | SoftConstraintCategory;

/**
 * Metadata row for a single category. Used by the future UI/compiler to:
 *  - render a human label for the category in admin views;
 *  - validate that a `kind`/`category` pair is consistent (you cannot have a
 *    hard `night_overcap` because the solver only models it as a penalty);
 *  - look up the default weight for soft categories.
 */
export interface ConstraintCategoryMetadata {
  kind: ConstraintKind;
  /** Short human-readable description (English; UI may localise). */
  description: string;
  /** Source-of-truth solver rule, for cross-referencing the Python code. */
  solverRule: string;
}

/**
 * Single canonical metadata table.
 *
 * Kept exhaustive via the `Record<…>` index signature — adding a new category
 * to either union above without updating this table is a TypeScript error.
 */
export const CONSTRAINT_CATEGORY_METADATA: Record<ConstraintCategory, ConstraintCategoryMetadata> =
  {
    // Hard
    availability: {
      kind: 'hard',
      description: 'Worker is unavailable for a specific shift slot.',
      solverRule: 'HC2 — _enforce_availability_blocks',
    },
    role_restriction: {
      kind: 'hard',
      description: 'Worker may only be assigned to shifts compatible with their role.',
      solverRule: 'HC3 — _enforce_manager_rule',
    },
    fixed_assignment: {
      kind: 'hard',
      description:
        'Worker must be assigned to a specific recurring shift unless explicitly excluded.',
      solverRule: 'HC4 — _enforce_fixed_morning_rule',
    },
    min_rest: {
      kind: 'hard',
      description: 'Minimum rest period between consecutive shifts (default 480 min).',
      solverRule: 'HC1 — _enforce_min_rest',
    },
    one_shift_per_day: {
      kind: 'hard',
      description: 'A worker holds at most one shift on any given calendar day.',
      solverRule: 'HC5 — _enforce_one_shift_per_day',
    },
    weekly_shift_cap: {
      kind: 'hard',
      description: 'A worker holds at most N shifts per week (default 6).',
      solverRule: 'HC6 — _enforce_weekly_cap',
    },
    coverage: {
      kind: 'hard',
      description: 'Every shift slot must be staffed up to its required count.',
      solverRule: 'HC7 — _enforce_coverage',
    },
    // Soft
    shift_balance: {
      kind: 'soft',
      description: 'Distribute total shifts evenly across workers.',
      solverRule: 'SOFT — W_SHIFT_BALANCE',
    },
    type_diversity: {
      kind: 'soft',
      description: 'Avoid concentrating one shift type (>60%) on a single worker.',
      solverRule: 'SOFT — W_TYPE_DIVERSITY',
    },
    rest_optimisation: {
      kind: 'soft',
      description: 'Prefer ≥16h rest between consecutive shifts even when 8h is legal.',
      solverRule: 'SOFT — W_REST_OPTIMISATION',
    },
    weekend_balance: {
      kind: 'soft',
      description: 'Distribute weekend shifts evenly; penalise workers above team average + 2.',
      solverRule: 'SOFT — W_WEEKEND_BALANCE',
    },
    night_overcap: {
      kind: 'soft',
      description: 'Penalise >2 night shifts per worker per week.',
      solverRule: 'SOFT — W_NIGHT_OVERCAP',
    },
    fri_sat_cluster: {
      kind: 'soft',
      description: 'Penalise the same worker holding both Friday and Saturday shifts.',
      solverRule: 'SOFT — W_FRI_SAT_CLUSTER',
    },
  };

/** Type guard: narrows a category to the hard subset. */
export const isHardCategory = (c: ConstraintCategory): c is HardConstraintCategory =>
  CONSTRAINT_CATEGORY_METADATA[c].kind === 'hard';

/** Type guard: narrows a category to the soft subset. */
export const isSoftCategory = (c: ConstraintCategory): c is SoftConstraintCategory =>
  CONSTRAINT_CATEGORY_METADATA[c].kind === 'soft';
