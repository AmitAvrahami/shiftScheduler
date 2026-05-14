/**
 * Core constraint domain types.
 *
 * A {@link Constraint} is a single rule the solver must respect (hard) or
 * weigh against alternatives (soft). The type is a discriminated union with
 * `kind` as the discriminant; narrow it with an exhaustive `switch`:
 *
 *     function describe(c: Constraint): string {
 *       switch (c.kind) {
 *         case 'hard':  return `must: ${c.category}`;
 *         case 'soft':  return `prefer (w=${c.weight}): ${c.category}`;
 *       }
 *     }
 *
 * **Worked example.** The legacy `IConstraintEntry { date, definitionId,
 * canWork: false }` becomes:
 *
 *     {
 *       id: constraintId(`${userId}:${weekId}:${date}:${defId}`),
 *       kind: 'hard',
 *       category: 'availability',
 *       targets: {
 *         scope: 'all',
 *         targets: [
 *           { kind: 'employee', employeeId: workerId(userId) },
 *           { kind: 'slot', date, definitionId },
 *         ],
 *       },
 *       source: { type: 'employee', actorId: workerId(userId) },
 *     }
 *
 * Nothing in PR #1 produces these values yet — that adapter lives in PR #2.
 *
 * @module constraint.types
 */

import type { HardConstraintCategory, SoftConstraintCategory } from './constraint.categories';
import type { ConstraintId, WorkerId } from './constraint.ids';
import type { ConstraintTargetSet } from './constraint.targets';
import type { ConstraintWeight } from './constraint.weights';

/**
 * Where a constraint came from. Modelled as a structured object rather than a
 * bare string so future flows (policy engines, AI suggestions, data
 * migrations) can attach an actor id or a free-text note without breaking the
 * shape.
 *
 *  - `'employee'`          — submitted by the worker via the constraint UI.
 *  - `'manager_override'`  — entered by a manager on behalf of someone (or
 *                            forced over an employee submission).
 *  - `'system'`            — derived automatically (e.g. role-based rules
 *                            generated from User.role).
 *  - `'policy'`            — produced by a policy engine (org-wide rules,
 *                            HR compliance) — placeholder for future use.
 *  - `'ai'`                — produced by an AI suggestion flow — placeholder
 *                            for future use.
 *  - `'migration'`         — synthesised by a data-migration script (e.g.
 *                            backfilling generic constraints from legacy
 *                            `IConstraint` documents in PR #3).
 */
export type ConstraintSourceType =
  | 'employee'
  | 'manager_override'
  | 'system'
  | 'policy'
  | 'ai'
  | 'migration';

/**
 * Provenance metadata attached to every constraint.
 *
 * `actorId` identifies the human (or service principal) responsible for the
 * constraint when applicable — the employee for `'employee'`, the manager for
 * `'manager_override'`, etc. It is optional because system/policy/ai sources
 * may have no single human actor.
 *
 * `note` is a free-text field for audit context (e.g. the migration script
 * version, the AI prompt id, the policy rule that emitted the constraint).
 */
export interface ConstraintSource {
  type: ConstraintSourceType;
  actorId?: WorkerId;
  note?: string;
}

/** Fields shared by every constraint regardless of kind. */
interface BaseConstraint {
  /** Stable identifier (Mongo `_id` once PR #3 lands; synthetic before then). */
  id: ConstraintId;
  /** Optional human-readable label for admin UIs and audit logs. */
  description?: string;
  /** Who/what this constraint binds to. See {@link ConstraintTargetSet}. */
  targets: ConstraintTargetSet;
  /** Provenance — see {@link ConstraintSource}. */
  source: ConstraintSource;
  /** ISO-8601 timestamp; optional until PR #3 wires it through. */
  createdAt?: string;
}

/**
 * Hard constraint — violation makes the schedule infeasible (or triggers the
 * solver's relaxation path with {@link RELAXATION_WEIGHTS}). No weight,
 * because hard rules are non-negotiable from the domain's perspective.
 */
export interface HardConstraint extends BaseConstraint {
  kind: 'hard';
  category: HardConstraintCategory;
}

/**
 * Soft constraint — violation contributes a penalty equal to {@link weight}
 * to the objective function. Multiple soft constraints of the same category
 * sum independently.
 */
export interface SoftConstraint extends BaseConstraint {
  kind: 'soft';
  category: SoftConstraintCategory;
  weight: ConstraintWeight;
}

/** A single domain constraint. */
export type Constraint = HardConstraint | SoftConstraint;

/** Read-only constraint collection — the typical input shape for the compiler. */
export type ConstraintList = readonly Constraint[];

/** Type guard: narrows to {@link HardConstraint}. */
export const isHardConstraint = (c: Constraint): c is HardConstraint => c.kind === 'hard';

/** Type guard: narrows to {@link SoftConstraint}. */
export const isSoftConstraint = (c: Constraint): c is SoftConstraint => c.kind === 'soft';
