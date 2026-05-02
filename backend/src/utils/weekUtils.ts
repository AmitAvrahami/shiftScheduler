import { 
  addDays, 
  subDays, 
  addWeeks, 
  format, 
  getISOWeek, 
  getISOWeekYear
} from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

const TIMEZONE = 'Asia/Jerusalem';

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
  
  // Use UTC-safe logic
  const week1Monday = new Date(jan4.getTime());
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4DayOfWeek - 1));
  week1Monday.setUTCHours(0, 0, 0, 0);
  
  return addWeeks(week1Monday, week - 1);
}

/**
 * Constraint deadline: the Monday of the given ISO week at 23:59:59.999 IST.
 */
export function getConstraintDeadline(weekId: string): Date {
  const { year, week } = parseWeekId(weekId);
  const mondayUTC = getISOWeekMondayUTC(year, week);
  
  // Format the date in the target timezone to get the correct YYYY-MM-DD
  const mondayZoned = toZonedTime(mondayUTC, TIMEZONE);
  const dateStr = format(mondayZoned, 'yyyy-MM-dd');
  
  // Construct the deadline at 23:59:59.999 in that timezone
  return fromZonedTime(`${dateStr} 23:59:59.999`, TIMEZONE);
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
  const mondayUTC = getISOWeekMondayUTC(year, week);
  const sundayUTC = subDays(mondayUTC, 1);

  return Array.from({ length: 7 }, (_, i) => {
    const dUTC = addDays(sundayUTC, i);
    const dZoned = toZonedTime(dUTC, TIMEZONE);
    // Return a date object representing midnight in local time
    return new Date(dZoned.getFullYear(), dZoned.getMonth(), dZoned.getDate());
  });
}

/**
 * Builds a local-time YYYY-MM-DD date key (matches scheduler convention).
 */
export function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/**
 * Returns the ISO weekId for the current moment expressed in Asia/Jerusalem.
 */
export function getCurrentWeekId(): string {
  const nowZoned = toZonedTime(new Date(Date.now()), TIMEZONE);
  const weekNum = getISOWeek(nowZoned);
  const weekYear = getISOWeekYear(nowZoned);

  return `${weekYear}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Returns the ISO weekId for the week immediately following weekId.
 */
export function getNextWeekId(weekId: string): string {
  const { year, week } = parseWeekId(weekId);
  const monday = getISOWeekMondayUTC(year, week);
  const nextMonday = addWeeks(monday, 1);
  
  const weekNum = getISOWeek(nextMonday);
  const weekYear = getISOWeekYear(nextMonday);
  
  return `${weekYear}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * The weekId employees are currently allowed to submit constraints for.
 * Before Monday 23:59:59.999 IST → current week.
 * After  Monday 23:59:59.999 IST → next week.
 */
export function getAllowedWeekId(): string {
  const current = getCurrentWeekId();
  return isConstraintDeadlinePassed(current) ? getNextWeekId(current) : current;
}
