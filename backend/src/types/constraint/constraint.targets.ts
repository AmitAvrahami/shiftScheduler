/**
 * Target descriptors for the constraint domain.
 *
 * A {@link Constraint} answers "what rule applies?" — its targets answer
 * "to whom and to which shifts does it apply?". The Python solver currently
 * answers the second question implicitly (e.g., "managers cannot work
 * weekends" hardcodes both the worker selector AND the shift selector). The
 * domain layer makes the selector explicit so the future Node compiler can
 * expand it into the cartesian product of `(WorkerId, ShiftId)` cells the
 * solver actually needs.
 *
 * Each target is a single discriminated union member with `kind` as the
 * discriminant; combine multiple targets via {@link ConstraintTargetSet} and
 * its `scope` field (AND / OR semantics).
 *
 * @module constraint.targets
 */

import type { ShiftId, WorkerId } from './constraint.ids';

/**
 * `YYYY-MM-DD` calendar-date string in the project's `Asia/Jerusalem` zone.
 * Kept as a branded alias of `string` for readability — strict validation
 * will live in the Zod schema layer (PR #2 or PR #3).
 */
export type CalendarDateString = string & { readonly __brand: 'CalendarDateString' };

/** Day-of-week index. Sunday = 0, matching the project's week convention. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Worker roles recognised by the existing User model. */
export type WorkerRole = 'employee' | 'manager' | 'admin';

/** Targets a single worker by id. */
export interface EmployeeTarget {
  kind: 'employee';
  employeeId: WorkerId;
}

/** Targets every worker holding a given role. */
export interface RoleTarget {
  kind: 'role';
  role: WorkerRole;
}

/**
 * Targets every shift derived from a given recurring `ShiftDefinition`
 * (e.g. "morning"). Note: this is the **definition** id, not a concrete
 * shift instance — the latter is {@link ShiftInstanceTarget}.
 */
export interface ShiftDefinitionTarget {
  kind: 'shift_definition';
  definitionId: string;
}

/**
 * Targets a single concrete shift instance by id. The compiler will resolve
 * this to one row in the solver's shift array.
 */
export interface ShiftInstanceTarget {
  kind: 'shift_instance';
  shiftId: ShiftId;
}

/** Targets every shift on a single calendar date. */
export interface DateTarget {
  kind: 'date';
  date: CalendarDateString;
}

/** Targets every shift falling on a particular day of the week. */
export interface DayOfWeekTarget {
  kind: 'day_of_week';
  dayOfWeek: DayOfWeek;
}

/**
 * Convenience target for "Friday + Saturday" — the project's weekend.
 * Equivalent to combining two `day_of_week` targets with `scope: 'any'`,
 * but exists as its own kind because the solver currently has hardcoded
 * weekend logic and we want the compiler to recognise the intent directly.
 */
export interface WeekendTarget {
  kind: 'weekend';
}

/**
 * Targets a specific `(date, definitionId)` cell. Mirrors the existing
 * `IConstraintEntry` shape so PR #2's compiler can translate every legacy
 * `canWork=false` entry into a single-target hard `availability` constraint.
 */
export interface SlotTarget {
  kind: 'slot';
  date: CalendarDateString;
  definitionId: string;
}

/** All target descriptors. Discriminated by `kind`. */
export type ConstraintTarget =
  | EmployeeTarget
  | RoleTarget
  | ShiftDefinitionTarget
  | ShiftInstanceTarget
  | DateTarget
  | DayOfWeekTarget
  | WeekendTarget
  | SlotTarget;

/**
 * How multiple targets combine when evaluating whether a `(worker, shift)`
 * cell is in scope.
 *
 *  - `'all'` — every target must match (intersection / AND). Example: a
 *    constraint targeting `[role:manager, weekend]` applies to managers' weekend
 *    shifts only.
 *  - `'any'` — at least one target must match (union / OR). Example: a
 *    constraint targeting `[employee:e1, employee:e2]` applies to either
 *    worker.
 *
 * Default semantics are intentionally NOT inferred — the compiler will
 * require an explicit scope so that adding a third target later cannot
 * silently change the rule's meaning.
 */
export type TargetScope = 'all' | 'any';

/**
 * A constraint's full target spec: one or more target descriptors plus the
 * combination scope. The compiler expands this into the set of solver cells
 * (worker × shift) the rule binds to.
 *
 * Invariant: `targets.length >= 1`. An empty target set is meaningless and
 * should be rejected at the validation layer (PR #2).
 */
export interface ConstraintTargetSet {
  scope: TargetScope;
  targets: ConstraintTarget[];
}
