// Frontend mirror of the scheduler's partial-availability rules so the manager
// UI can preview what the solver will do. Keep in sync with
// backend/src/services/compiler/availabilityClassifier.ts.

import type { ShiftDefinition } from '../types/constraint';

export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Anything below this overlap is treated as full unavailability by the solver. */
export const PARTIAL_MIN_OVERLAP_MINUTES = 360;

const MINUTES_PER_DAY = 1440;

export type AvailabilityClassification = 'forbidden' | 'available' | 'partial_warning';

/** 15-minute increments from "00:00" to "23:45". */
export const TIME_OPTIONS: string[] = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4);
  const m = (i % 4) * 15;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

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

/** `endTime <= startTime` is read as crossing midnight (endMin += 1440). */
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

/** Minutes of a partial window that overlap the given shift, anchored on the shift axis. */
export function overlapWithShift(
  startTime: string,
  endTime: string,
  def: Pick<ShiftDefinition, 'startTime' | 'durationMinutes'>
): number {
  const shiftStart = parseTimeToMinutes(def.startTime);
  const shiftEnd = shiftStart + def.durationMinutes;

  const avail = normalizeTimeRange(startTime, endTime);
  let availStart = avail.startMin;
  let availEnd = avail.endMin;
  if (availEnd <= shiftStart) {
    availStart += MINUTES_PER_DAY;
    availEnd += MINUTES_PER_DAY;
  }

  return calculateOverlapMinutes(availStart, availEnd, shiftStart, shiftEnd);
}

export function classifyPartial(
  startTime: string,
  endTime: string,
  def: Pick<ShiftDefinition, 'startTime' | 'durationMinutes'>
): AvailabilityClassification {
  const overlap = overlapWithShift(startTime, endTime, def);
  if (overlap >= def.durationMinutes) return 'available';
  if (overlap >= PARTIAL_MIN_OVERLAP_MINUTES) return 'partial_warning';
  return 'forbidden';
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} ${h === 1 ? 'שעה' : 'שעות'}`);
  if (m > 0) parts.push(`${m} ${m === 1 ? 'דקה' : 'דקות'}`);
  return parts.length > 0 ? parts.join(' ') : '0 דקות';
}

const MEANING_LABELS: Record<AvailabilityClassification, string> = {
  forbidden: 'תיחשב כלא זמינה בשיבוץ',
  partial_warning: 'תאושר עם קנס',
  available: 'תיחשב כזמינה מלאה',
};

export interface PartialPreview {
  rangeLabel: string;
  durationMinutes: number;
  durationLabel: string;
  overlapMinutes: number;
  meaning: AvailabilityClassification;
  meaningLabel: string;
}

/** Build the partial-availability preview, or null if times are missing/invalid. */
export function getPartialPreview(
  startTime: string | undefined,
  endTime: string | undefined,
  def: Pick<ShiftDefinition, 'startTime' | 'durationMinutes'>
): PartialPreview | null {
  if (!startTime || !endTime || !TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
    return null;
  }
  const range = normalizeTimeRange(startTime, endTime);
  const durationMinutes = range.endMin - range.startMin;
  const overlapMinutes = overlapWithShift(startTime, endTime, def);
  const meaning = classifyPartial(startTime, endTime, def);
  return {
    rangeLabel: `${startTime}–${endTime}`,
    durationMinutes,
    durationLabel: formatDuration(durationMinutes),
    overlapMinutes,
    meaning,
    meaningLabel: MEANING_LABELS[meaning],
  };
}

export interface PartialValidation {
  error?: string;
  warning?: string;
}

/**
 * Validate a partial range for a shift cell:
 *  - missing start/end blocks Apply/Save.
 *  - a non-night shift may not use an overnight range (endTime <= startTime).
 *  - night shifts allow overnight ranges.
 *  - under-6h overlap is allowed but warned.
 */
export function validatePartialRange(
  startTime: string | undefined,
  endTime: string | undefined,
  def: Pick<ShiftDefinition, 'startTime' | 'durationMinutes' | 'crossesMidnight'>
): PartialValidation {
  if (!startTime || !endTime) {
    return { error: 'יש לבחור שעת התחלה ושעת סיום' };
  }
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);

  if (!def.crossesMidnight && endMin <= startMin) {
    return { error: 'משמרת שאינה לילה אינה יכולה לחצות חצות (שעת סיום חייבת להיות אחרי ההתחלה)' };
  }

  if (overlapWithShift(startTime, endTime, def) < PARTIAL_MIN_OVERLAP_MINUTES) {
    return { warning: 'זמינות חלקית מתחת ל־6 שעות תיחשב כלא זמינה בשיבוץ' };
  }

  return {};
}
