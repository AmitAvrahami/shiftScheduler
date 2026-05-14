/**
 * Wire-format DTOs for the future Node→Python solver payload.
 *
 * These types describe the shape PR #2's compiler will emit and the Python
 * solver will consume after its "ignorant solver" refactor. They are kept in
 * a dedicated file (and use snake_case, matching `services/solverClient.ts`)
 * so the in-memory domain types in {@link constraint.types} remain free to
 * evolve without breaking the wire contract.
 *
 * **Not imported by runtime code in PR #1.** The current Python solver still
 * ingests the boolean `availability` shape from `solverClient.ts`. PR #2 will
 * (a) build a compiler that produces a {@link GenericSolverPayloadDTO} from a
 * `Constraint[]`, and (b) extend the Python solver to consume it alongside —
 * then later, instead of — the legacy fields.
 *
 * Field-naming convention:
 *  - snake_case keys, matching existing solver wire types.
 *  - `worker_id` / `shift_id` are the **stringified** branded ids — the
 *    branding does not survive JSON serialisation, which is fine because the
 *    solver treats them as opaque tokens.
 *
 * @module constraint.dto
 */

import type { SoftConstraintCategory } from './constraint.categories';

/**
 * A single forbidden `(worker, shift)` cell. The compiler expands every hard
 * constraint into one or more entries; the solver enforces them with
 * `cp_model.Add(var == 0)`.
 *
 * Unioning multiple hard categories into the same DTO shape is intentional —
 * by the time the payload reaches the solver, all that matters is which cells
 * are off-limits, not why.
 */
export interface ForbiddenAssignmentDTO {
  worker_id: string;
  shift_id: string;
}

/**
 * A single penalty term for the solver's objective function. The compiler
 * emits one per soft-constraint violation surface; the solver multiplies
 * `weight` by an indicator variable and adds it to the objective.
 *
 * Either or both of `worker_id` / `shift_id` may be omitted to express
 * aggregate penalties (e.g. "weekend_balance" applies to a worker across all
 * weekend shifts, not to a specific cell).
 */
export interface PenaltyTermDTO {
  worker_id?: string;
  shift_id?: string;
  category: SoftConstraintCategory;
  weight: number;
}

/**
 * Relaxation weights mirrored from {@link RELAXATION_WEIGHTS} for the
 * solver's fallback path. Sent on the wire because PR #2 makes Node the
 * source of truth for these constants.
 */
export interface RelaxationWeightsDTO {
  load: number;
  coverage: number;
}

/**
 * The full generic payload PR #2's compiler will append to the solver
 * request. Designed to coexist with the legacy fields in `SolverWorker` so
 * the migration can be staged: PR #2 sends both, PR #3 stops sending the
 * legacy fields.
 */
export interface GenericSolverPayloadDTO {
  forbidden_assignments: ForbiddenAssignmentDTO[];
  penalties: PenaltyTermDTO[];
  relaxation_weights: RelaxationWeightsDTO;
}
