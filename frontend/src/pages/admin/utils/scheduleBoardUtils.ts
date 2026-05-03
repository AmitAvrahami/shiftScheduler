import type { AdminDashboardDTO, ShiftType } from '../types';

export const WEEK_DAYS_ORDER = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export const SHIFT_TYPES_ORDER = ['morning', 'afternoon', 'night'] as const;

export type WeekDayKey = (typeof WEEK_DAYS_ORDER)[number];
export type OrderedShiftType = (typeof SHIFT_TYPES_ORDER)[number];
export type ShiftFillStatus = 'full' | 'partial' | 'empty' | 'unknown';

export type AdminDashboardShift = AdminDashboardDTO['shifts'][number];
export type AdminDashboardAssignment = AdminDashboardDTO['assignments'][number];
export type AdminDashboardEmployee = AdminDashboardDTO['employees'][number];

const DAY_LABELS_HEBREW: Record<WeekDayKey, string> = {
  sunday: 'ראשון',
  monday: 'שני',
  tuesday: 'שלישי',
  wednesday: 'רביעי',
  thursday: 'חמישי',
  friday: 'שישי',
  saturday: 'שבת',
};

const SHIFT_LABELS_HEBREW: Record<ShiftType, string> = {
  morning: 'בוקר',
  afternoon: 'צהריים',
  night: 'לילה',
  unknown: 'משמרת לא ידועה',
};

const HEBREW_DAY_KEYS: Record<string, WeekDayKey> = {
  ראשון: 'sunday',
  'יום ראשון': 'sunday',
  שני: 'monday',
  'יום שני': 'monday',
  שלישי: 'tuesday',
  'יום שלישי': 'tuesday',
  רביעי: 'wednesday',
  'יום רביעי': 'wednesday',
  חמישי: 'thursday',
  'יום חמישי': 'thursday',
  שישי: 'friday',
  'יום שישי': 'friday',
  שבת: 'saturday',
  'יום שבת': 'saturday',
};

export function getDayLabel(day: WeekDayKey): string {
  return DAY_LABELS_HEBREW[day];
}

export function getShiftTypeLabel(type: ShiftType): string {
  return SHIFT_LABELS_HEBREW[type] ?? SHIFT_LABELS_HEBREW.unknown;
}

export function normalizeShiftDay(day: string): WeekDayKey | null {
  const trimmedDay = day.trim();

  if (isIsoDateString(trimmedDay)) {
    const dayFromIsoDate = getDayFromIsoDate(trimmedDay);
    if (dayFromIsoDate) {
      return dayFromIsoDate;
    }
  }

  const lowerDay = trimmedDay.toLowerCase();
  if (isWeekDayKey(lowerDay)) {
    return lowerDay;
  }

  return HEBREW_DAY_KEYS[trimmedDay] ?? null;
}

export function sortDaysSundayToSaturday(days: string[]): WeekDayKey[] {
  const normalizedDays = new Set<WeekDayKey>();

  days.forEach(day => {
    const normalizedDay = normalizeShiftDay(day);
    if (normalizedDay) {
      normalizedDays.add(normalizedDay);
    }
  });

  return WEEK_DAYS_ORDER.filter(day => normalizedDays.has(day));
}

export function groupShiftsByDay(
  shifts: AdminDashboardShift[],
): Record<WeekDayKey, AdminDashboardShift[]> {
  const groupedShifts = createEmptyGroupedShifts();

  shifts.forEach(shift => {
    const day = normalizeShiftDay(shift.day);
    if (day) {
      groupedShifts[day].push(shift);
    }
  });

  return groupedShifts;
}

export function getAssignmentsForShift(
  assignments: AdminDashboardAssignment[],
  shiftId: string,
): AdminDashboardAssignment[] {
  return assignments.filter(assignment => assignment.shiftId === shiftId);
}

export function getEmployeesForAssignments(
  employees: AdminDashboardEmployee[],
  assignments: AdminDashboardAssignment[],
): AdminDashboardEmployee[] {
  const employeesById = new Map(employees.map(employee => [employee.id, employee]));

  return assignments
    .map(assignment => employeesById.get(assignment.employeeId))
    .filter((employee): employee is AdminDashboardEmployee => Boolean(employee));
}

export function getShiftFillStatus(
  shift: AdminDashboardShift | undefined,
  assignments: AdminDashboardAssignment[],
): ShiftFillStatus {
  if (!shift || shift.type === 'unknown') {
    return 'unknown';
  }

  if (assignments.length === 0) {
    return 'empty';
  }

  if (assignments.length >= Math.max(0, shift.requiredEmployees)) {
    return 'full';
  }

  return 'partial';
}

function createEmptyGroupedShifts(): Record<WeekDayKey, AdminDashboardShift[]> {
  return WEEK_DAYS_ORDER.reduce<Record<WeekDayKey, AdminDashboardShift[]>>(
    (groupedShifts, day) => {
      groupedShifts[day] = [];
      return groupedShifts;
    },
    {
      sunday: [],
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
    },
  );
}

function isWeekDayKey(day: string): day is WeekDayKey {
  return WEEK_DAYS_ORDER.includes(day as WeekDayKey);
}

function isIsoDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value);
}

function getDayFromIsoDate(value: string): WeekDayKey | null {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return WEEK_DAYS_ORDER[parsedDate.getUTCDay()];
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return WEEK_DAYS_ORDER[parsedDate.getDay()];
}
