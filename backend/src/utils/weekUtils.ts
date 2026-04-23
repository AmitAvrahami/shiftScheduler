// IST = UTC+3 (fixed offset, per CLAUDE.md)
const IST_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseWeekId(weekId: string): { year: number; week: number } {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) throw new Error(`Invalid weekId format: ${weekId}`);
  return { year: parseInt(match[1], 10), week: parseInt(match[2], 10) };
}

// Returns the UTC Date corresponding to Monday 00:00:00 UTC of the given ISO week.
function getISOWeekMondayUTC(year: number, week: number): Date {
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayOfWeek = jan4.getUTCDay() || 7; // ISO: Mon=1 … Sun=7
  const week1MondayMs = jan4.getTime() - (jan4DayOfWeek - 1) * DAY_MS;
  return new Date(week1MondayMs + (week - 1) * 7 * DAY_MS);
}

/**
 * Constraint deadline: the Monday of the given ISO week at 23:59:59.999 IST.
 * IST = UTC+3, so Mon 23:59:59.999 IST = Mon 20:59:59.999 UTC.
 */
export function getConstraintDeadline(weekId: string): Date {
  const { year, week } = parseWeekId(weekId);
  const monday = getISOWeekMondayUTC(year, week);
  return new Date(
    Date.UTC(
      monday.getUTCFullYear(),
      monday.getUTCMonth(),
      monday.getUTCDate(),
      20,
      59,
      59,
      999
    )
  );
}

export function isConstraintDeadlinePassed(weekId: string): boolean {
  return Date.now() > getConstraintDeadline(weekId).getTime();
}

/**
 * Returns 7 LOCAL-midnight Date objects (Sun–Sat) for the given ISO weekId.
 * Sunday = ISO week Monday − 1 day.
 * Uses local time (not UTC) to match the scheduler's date-key convention.
 */
export function getWeekDates(weekId: string): Date[] {
  const { year, week } = parseWeekId(weekId);
  const monday = getISOWeekMondayUTC(year, week);
  const sundayMs = monday.getTime() - DAY_MS;

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sundayMs + i * DAY_MS);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); // local midnight
  });
}

/**
 * Builds a local-time YYYY-MM-DD date key (matches scheduler convention).
 * Never use toISOString() — UTC offset causes off-by-one in IST.
 */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Returns the ISO weekId for the current moment expressed in IST (UTC+3).
 */
export function getCurrentWeekId(): string {
  const nowIST = new Date(Date.now() + IST_OFFSET_MS);
  const year = nowIST.getUTCFullYear();
  const month = nowIST.getUTCMonth();
  const day = nowIST.getUTCDate();

  // ISO week number: Thursday-anchor algorithm
  const thursday = new Date(Date.UTC(year, month, day));
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thursday.getTime() - jan1.getTime()) / DAY_MS + 1) / 7);
  const weekYear = thursday.getUTCFullYear();

  return `${weekYear}-W${String(weekNum).padStart(2, '0')}`;
}
