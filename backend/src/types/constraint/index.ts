/**
 * Public entry point for the constraint domain types.
 *
 * Import from this barrel rather than the individual files so call sites
 * remain stable if the internal layout changes:
 *
 *     import type { Constraint, ConstraintTarget, ConstraintCategory } from '../types/constraint';
 *
 * Nothing in PR #1 imports from here at runtime — see PR #2 for the first
 * real consumer (the constraint compiler).
 *
 * @module types/constraint
 */

export * from './constraint.categories';
export * from './constraint.dto';
export * from './constraint.ids';
export * from './constraint.targets';
export * from './constraint.types';
export * from './constraint.weights';
