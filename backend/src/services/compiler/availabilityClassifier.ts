import { deriveAvailabilityType, TIME_REGEX } from '../../utils/constraintAvailability';
import type { LeanShiftDefinition } from '../solverMapper';

/**
 * Minimum useful partial availability window. Anything below this is treated
 * as if the employee declared themselves unavailable for the whole shift.
 */
export const PARTIAL_MIN_OVERLAP_MINUTES = 360;

const MINUTES_PER_DAY = 1440;

export type AvailabilityClassification = 'forbidden' | 'available' | 'partial_warning';

export interface ClassifiableEntry {
  canWork: boolean;
  availabilityType?: 'available' | 'unavailable' | 'partial';
  startTime?: string;
  endTime?: string;
}

/** Parse `"HH:MM"` to minutes since midnight (0..1439). Throws on malformed input. */
export function parseTimeToMinutes(time: string): number {
  if (!TIME_REGEX.test(time)) {
    throw new RangeError(`Invalid time string: ${time}`);
  }
  const [hh, mm] = time.split(':');
  return Number(hh) * 60 + Number(mm);
}

export interface NormalizedTimeRange {
  startMin: number;
  endMin: number;
  crossesMidnight: boolean;
}

/**
 * Project an `HH:MM` start/end pair onto an extended minute axis so overnight
 * ranges form a contiguous interval. `endTime <= startTime` is interpreted as
 * crossing midnight, so `endMin` is shifted by 1440. Equal times collapse to a
 * full 24-hour window (rare but allowed for "all-day" availability).
 */
export function normalizeTimeRange(startTime: string, endTime: string): NormalizedTimeRange {
  const startMin = parseTimeToMinutes(startTime);
  let endMin = parseTimeToMinutes(endTime);
  let crossesMidnight = false;

  if (endMin < startMin) {
    endMin += MINUTES_PER_DAY;
    crossesMidnight = true;
  } else if (endMin === startMin) {
    endMin += MINUTES_PER_DAY;
  }

  return { startMin, endMin, crossesMidnight };
}

/**
 * Intersect two intervals on the same minute axis. The caller is responsible
 * for putting both ranges on a comparable axis — see `classifyAvailability...`
 * for the shift-anchored alignment used by the compiler.
 */
export function calculateOverlapMinutes(
  availStart: number,
  availEnd: number,
  shiftStart: number,
  shiftEnd: number
): number {
  const lo = Math.max(availStart, shiftStart);
  const hi = Math.min(availEnd, shiftEnd);
  return Math.max(0, hi - lo);
}

/**
 * Decide how a constraint entry interacts with a single shift definition:
 *
 *  - `'forbidden'`        — hard block. Solver must not assign this cell.
 *  - `'available'`        — no restriction. Solver treats normally.
 *  - `'partial_warning'`  — soft penalty. Solver may assign but at a cost.
 *
 * Product rules:
 *  - `deriveAvailabilityType === 'unavailable'` → forbidden.
 *  - `deriveAvailabilityType === 'available'`   → available.
 *  - `'partial'` without both startTime + endTime → available (defensive; the
 *    Zod schema rejects this shape at the API boundary).
 *  - `'partial'` overlap ≥ shift duration       → available.
 *  - `'partial'` overlap ≥ 360 min, < duration  → partial_warning.
 *  - `'partial'` overlap < 360 min (incl. 0)    → forbidden.
 */
export function classifyAvailabilityAgainstShift(
  entry: ClassifiableEntry,
  shiftDefinition: Pick<
    LeanShiftDefinition,
    'startTime' | 'endTime' | 'durationMinutes' | 'crossesMidnight'
  >
): AvailabilityClassification {
  const type = deriveAvailabilityType(entry);

  if (type === 'unavailable') return 'forbidden';
  if (type === 'available') return 'available';

  if (!entry.startTime || !entry.endTime) {
    return 'available';
  }

  const shiftStart = parseTimeToMinutes(shiftDefinition.startTime);
  const shiftDuration = shiftDefinition.durationMinutes;
  const shiftEnd = shiftStart + shiftDuration;

  const availRaw = normalizeTimeRange(entry.startTime, entry.endTime);

  // Anchor availability on the same day axis as the shift. If the shift starts
  // late and the availability window is on the early-morning side of midnight
  // (e.g. shift 22:45 start, availability 00:00–06:45), shift the availability
  // forward by a day so the intersection lines up.
  let availStart = availRaw.startMin;
  let availEnd = availRaw.endMin;
  if (availEnd <= shiftStart) {
    availStart += MINUTES_PER_DAY;
    availEnd += MINUTES_PER_DAY;
  }

  const overlap = calculateOverlapMinutes(availStart, availEnd, shiftStart, shiftEnd);

  if (overlap >= shiftDuration) return 'available';
  if (overlap >= PARTIAL_MIN_OVERLAP_MINUTES) return 'partial_warning';
  return 'forbidden';
}
