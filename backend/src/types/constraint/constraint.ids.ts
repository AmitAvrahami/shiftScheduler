/**
 * Branded identifier types for the constraint domain.
 *
 * Domain identifiers are stringly-typed at the storage layer (Mongo `_id`,
 * solver wire payloads, REST URLs), but inside the application we want the
 * compiler to refuse a `WorkerId` where a `ShiftId` is expected. Branding
 * achieves this without runtime cost: the brand is a phantom property that
 * exists only in the type system.
 *
 * Usage:
 *   const w = workerId(user._id.toString());   // string -> WorkerId
 *   const raw: string = w;                     // WorkerId widens to string freely
 *   const s: ShiftId = w;                      // ❌ type error (intended)
 *
 * The factories perform no runtime validation by design — they exist so call
 * sites read as `workerId(x)` rather than `x as WorkerId`, which is easier to
 * grep for and review. If validation is needed later (e.g. rejecting empty
 * strings), it can be added inside each factory without touching call sites.
 *
 * @module constraint.ids
 */

/** Generic brand helper. The second type parameter is a unique tag string. */
type Brand<T, B extends string> = T & { readonly __brand: B };

/**
 * Stable identifier for a single {@link Constraint} record.
 *
 * In PR #3 this maps to the Mongo `_id` of the polymorphic constraint
 * document. Until then, callers may synthesise an id (e.g. a UUID or a
 * deterministic hash of `userId + weekId + slot`) when they construct a
 * domain `Constraint` from the legacy `IConstraint` document.
 */
export type ConstraintId = Brand<string, 'ConstraintId'>;

/**
 * Stable identifier for a worker (employee or manager).
 *
 * Mirrors `User._id.toString()` from the existing User model. Once the
 * compiler layer (PR #2) lands, every reference to a worker inside a
 * constraint must be a `WorkerId`, not a raw string.
 */
export type WorkerId = Brand<string, 'WorkerId'>;

/**
 * Stable identifier for a single shift instance (a concrete `(date,
 * definitionId, slot)` row in the schedule).
 *
 * Distinct from `ShiftDefinitionId` (the recurring template). The current
 * solver wire payload uses snake_case `shift_id`; the domain layer uses this
 * branded camelCase form and the wire DTOs do the conversion at the edge.
 */
export type ShiftId = Brand<string, 'ShiftId'>;

/**
 * Stable identifier for a weekly schedule document.
 *
 * Included for completeness even though PR #1 does not yet surface it on any
 * constraint type — schedule-scoped constraints (e.g. "for this draft only")
 * will need it in PR #3.
 */
export type ScheduleId = Brand<string, 'ScheduleId'>;

/**
 * Construct a {@link ConstraintId} from a raw string.
 * Performs no validation — see module docstring for rationale.
 */
export const constraintId = (raw: string): ConstraintId => raw as ConstraintId;

/** Construct a {@link WorkerId} from a raw string. */
export const workerId = (raw: string): WorkerId => raw as WorkerId;

/** Construct a {@link ShiftId} from a raw string. */
export const shiftId = (raw: string): ShiftId => raw as ShiftId;

/** Construct a {@link ScheduleId} from a raw string. */
export const scheduleId = (raw: string): ScheduleId => raw as ScheduleId;
