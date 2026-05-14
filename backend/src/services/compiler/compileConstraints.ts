import type { LeanConstraint, LeanShift, LeanShiftDefinition, LeanUser } from '../solverMapper';
import type { SolverAvailabilityEntry } from '../solverClient';
import type { Constraint, GenericSolverPayloadDTO } from '../../types/constraint';

import { normalizeLegacyConstraints } from './constraintNormalizer';
import { buildForbiddenAssignments } from './forbiddenAssignmentsBuilder';
import { buildPenalties, defaultRelaxationWeights } from './penaltiesBuilder';
import { toLegacyAvailability } from './legacySolverAdapter';

export interface CompilerInput {
  weekId: string;
  workers: LeanUser[];
  shifts: LeanShift[];
  shiftDefinitions: LeanShiftDefinition[];
  constraints: LeanConstraint[];
}

export interface CompilerOutput {
  /** Domain-shaped constraints — useful for tests, logging, future consumers. */
  normalized: Constraint[];
  /** Generic payload the Python solver will consume in PR #3 (not yet sent). */
  generic: GenericSolverPayloadDTO;
  /** Legacy per-worker availability map used by `toSolveRequest` today. */
  availabilityByWorker: Map<string, SolverAvailabilityEntry[]>;
}

/**
 * Public entry point for the Node-side constraint compiler.
 *
 * This is a thin pipeline by design:
 *
 *   IConstraint[]  ──normalize──▶  Constraint[]
 *                  ──forbidden──▶  ForbiddenAssignmentDTO[]
 *                  ──penalties──▶  PenaltyTermDTO[]
 *                  ──adapter────▶  Map<workerId, SolverAvailabilityEntry[]>
 *
 * PR #2 only consumes the adapter output (so runtime behaviour stays
 * identical to today). PR #3 will swap the consumer to the generic DTO and
 * begin retiring the legacy path.
 */
export function compileConstraints(input: CompilerInput): CompilerOutput {
  const normalized = normalizeLegacyConstraints(input.constraints, input.weekId);

  const forbidden = buildForbiddenAssignments(normalized, {
    workers: input.workers,
    shifts: input.shifts,
    shiftDefinitions: input.shiftDefinitions,
  });

  const penalties = buildPenalties(normalized);

  const availabilityByWorker = toLegacyAvailability(forbidden, input.constraints);

  const generic: GenericSolverPayloadDTO = {
    forbidden_assignments: forbidden,
    penalties,
    relaxation_weights: defaultRelaxationWeights(),
  };

  return { normalized, generic, availabilityByWorker };
}
