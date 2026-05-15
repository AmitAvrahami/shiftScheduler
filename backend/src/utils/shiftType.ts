export type ShiftType = 'morning' | 'afternoon' | 'night';

/**
 * Language-independent shift classification for the CSP solver.
 *
 * Shift names are localized (Hebrew in production: בוקר/צהריים/לילה), so the
 * solver must not infer type from the name. We derive it from the schedule
 * shape instead:
 *   - crosses midnight              → night  (e.g. 22:45 → 06:45)
 *   - otherwise starts before 12:00 → morning
 *   - otherwise                     → afternoon
 */
export function classifyShiftType(def: { startTime: string; crossesMidnight: boolean }): ShiftType {
  if (def.crossesMidnight) return 'night';
  const startHour = parseInt(def.startTime.split(':')[0], 10);
  if (Number.isFinite(startHour) && startHour < 12) return 'morning';
  return 'afternoon';
}
