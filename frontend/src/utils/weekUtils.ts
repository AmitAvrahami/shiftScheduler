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

/**
 * Returns the ISO weekId for the week immediately following weekId.
 */
export function getNextWeekId(weekId: string): string {
  const { year, week } = parseWeekId(weekId);
  const monday = getISOWeekMondayUTC(year, week);
  const nextMonday = new Date(monday.getTime() + 7 * DAY_MS);
  const thursday = new Date(
    Date.UTC(nextMonday.getUTCFullYear(), nextMonday.getUTCMonth(), nextMonday.getUTCDate() + 3)
  );
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thursday.getTime() - jan1.getTime()) / DAY_MS + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Returns the ISO weekId for the week immediately preceding weekId.
 */
export function getPrevWeekId(weekId: string): string {
  const { year, week } = parseWeekId(weekId);
  const monday = getISOWeekMondayUTC(year, week);
  const prevMonday = new Date(monday.getTime() - 7 * DAY_MS);
  const thursday = new Date(
    Date.UTC(prevMonday.getUTCFullYear(), prevMonday.getUTCMonth(), prevMonday.getUTCDate() + 3)
  );
  const jan1 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thursday.getTime() - jan1.getTime()) / DAY_MS + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Returns 7 Date objects for the given ISO weekId, Sun-Sat.
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
 * Builds a local-time YYYY-MM-DD date key.
 */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Formats a Date as local-time DD/MM/YYYY (no toISOString, to avoid TZ off-by-one).
 */
function formatLocalDMY(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

export interface WeekLabelParts {
  weekNumber: number;
  startDate: string; // DD/MM/YYYY
  endDate: string; // DD/MM/YYYY
  dateRange: string; // "{startDate}–{endDate}" — an LTR run; render with dir="ltr"
  label: string; // "שבוע {N} · {dateRange}" — plain-text fallback only
}

/**
 * Canonical parts for the current/selected week label.
 * Range uses getWeekDates (Sun–Sat), the app's established convention, so the
 * displayed range matches everything else keyed off the same weekId.
 */
export function getWeekLabelParts(weekId: string): WeekLabelParts {
  const { week } = parseWeekId(weekId);
  const dates = getWeekDates(weekId);
  const startDate = formatLocalDMY(dates[0]);
  const endDate = formatLocalDMY(dates[6]);
  const dateRange = `${startDate}–${endDate}`;
  return { weekNumber: week, startDate, endDate, dateRange, label: `שבוע ${week} · ${dateRange}` };
}

/**
 * Backend GET serializes constraint dates as ISO (e.g. "2026-05-24T00:00:00.000Z"),
 * but PUT validation expects strict YYYY-MM-DD. Normalize loaded dates before using
 * them as cell keys or in the save payload. Idempotent for already-normalized strings.
 */
export function normalizeConstraintDate(date: string): string {
  return date.includes('T') ? date.split('T')[0] : date;
}

export function getConstraintDeadline(weekId: string): Date {
  const { year, week } = parseWeekId(weekId);
  const monday = getISOWeekMondayUTC(year, week);
  return new Date(
    Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), 20, 59, 59, 999)
  );
}

export function formatIsraelTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isConstraintDeadlinePassed(weekId: string): boolean {
  return Date.now() > getConstraintDeadline(weekId).getTime();
}

export function getAllowedWeekId(): string {
  const current = getCurrentWeekId();
  return isConstraintDeadlinePassed(current) ? getNextWeekId(current) : current;
}

/**
 * Returns the current time expressed in IST (UTC+3) as discrete parts.
 * day is 0=Sunday … 6=Saturday, matching WEEK_DAYS_ORDER.
 */
export function getNowInIsraelParts(now: Date = new Date()): {
  day: number;
  hour: number;
  minute: number;
} {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    day: ist.getUTCDay(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
  };
}
