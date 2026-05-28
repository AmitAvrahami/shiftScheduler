import type { GenerateWarning } from '../../../lib/api';

// Hebrew labels keyed by the solver's structured warning `type`. Falls back to
// the raw English `message` when the type is unknown (e.g. an older solver).
export const WARNING_TYPE_LABELS: Record<string, string> = {
  NIGHT_OVERCAP: 'ריבוי משמרות לילה',
  FRI_SAT_CLUSTER: 'שיבוץ בשישי ובשבת',
  SHIFT_BALANCE: 'חוסר איזון במספר משמרות',
  WEEKEND_BALANCE: 'חוסר איזון במשמרות סוף שבוע',
  TYPE_DIVERSITY: 'ריכוז גבוה של סוג משמרת אחד',
  ASSIGNMENT_PREFERENCE: 'זמינות חלקית / העדפת שיבוץ',
};

type SolverShiftType = 'morning' | 'afternoon' | 'night';

export const SHIFT_TYPE_LABELS_HE: Record<SolverShiftType, string> = {
  morning: 'בוקר',
  afternoon: 'צהריים',
  night: 'לילה',
};

export function getWarningLabel(warning: GenerateWarning): string {
  const key = warning.type ?? warning.constraint_id;
  if (key && WARNING_TYPE_LABELS[key]) return WARNING_TYPE_LABELS[key];
  return warning.message;
}

export function getWarningSeverity(warning: GenerateWarning): 'info' | 'warning' {
  return warning.severity === 'info' ? 'info' : 'warning';
}

// Resolve a warning's worker to a display name. Returns the employee name when the
// id is known, otherwise the raw worker_id as a fallback, or undefined if the
// warning has no worker.
export function getWarningWorkerName(
  warning: GenerateWarning,
  nameById?: Map<string, string>
): string | undefined {
  const workerId = warning.worker_id;
  if (!workerId) return undefined;
  return nameById?.get(workerId) ?? workerId;
}

// Return the warning's English message with the raw worker_id substring replaced
// by the resolved employee name, so a fallback message never exposes a raw ID.
export function formatWarningMessage(
  warning: GenerateWarning,
  nameById?: Map<string, string>
): string {
  const workerId = warning.worker_id;
  if (!workerId) return warning.message;
  const name = nameById?.get(workerId);
  if (!name) return warning.message;
  return warning.message.split(workerId).join(name);
}

export function formatWarningDescription(
  warning: GenerateWarning,
  nameById?: Map<string, string>
): string {
  const workerName = getWarningWorkerName(warning, nameById) ?? 'עובד/ת';
  const fallback = () => formatWarningMessage(warning, nameById);

  switch (warning.type) {
    case 'SHIFT_BALANCE': {
      const match = warning.message.match(/has (\d+) shifts vs team avg ([\d.]+)\./);
      if (!match) return fallback();
      const [, count, average] = match;
      return `${workerName} שובץ/ה ל-${count} משמרות לעומת ממוצע צוותי של ${average}.`;
    }
    case 'NIGHT_OVERCAP': {
      const match = warning.message.match(/has (\d+) night shifts/);
      if (!match) return fallback();
      const [, count] = match;
      return `${workerName} שובץ/ה ל-${count} משמרות לילה (מעל הסף של 2).`;
    }
    case 'FRI_SAT_CLUSTER':
      return `${workerName} שובץ/ה גם ביום שישי וגם בשבת.`;
    case 'WEEKEND_BALANCE': {
      const match = warning.message.match(/has (\d+) weekend shifts vs team avg ([\d.]+)\./);
      if (!match) return fallback();
      const [, count, average] = match;
      return `${workerName} שובץ/ה ל-${count} משמרות סוף שבוע לעומת ממוצע צוותי של ${average}.`;
    }
    case 'TYPE_DIVERSITY': {
      const match = warning.message.match(
        /(\d+)\/(\d+) shifts are (morning|afternoon|night) \((\d+)%\)/
      );
      if (!match) return fallback();
      const [, count, total, shiftType, percentage] = match;
      const shiftTypeLabel = SHIFT_TYPE_LABELS_HE[shiftType as SolverShiftType];
      if (!shiftTypeLabel) return fallback();
      return `${workerName}: ${count} מתוך ${total} משמרות הן ${shiftTypeLabel} (${percentage}%).`;
    }
    case 'ASSIGNMENT_PREFERENCE':
      return `${workerName} שובץ/ה למשמרת עם זמינות חלקית או העדפת שיבוץ.`;
    default:
      return fallback();
  }
}

export function warningCellKey(shiftId: string, employeeId: string): string {
  return `${shiftId}|${employeeId}`;
}

// Index warnings by `${shiftId}|${employeeId}` so a board cell can look up the
// warnings that touch a specific employee assignment. Warnings without both a
// worker and at least one shift id are skipped (they cannot map to a cell).
export function buildWarningsByCell(
  warnings: GenerateWarning[] | undefined
): Map<string, GenerateWarning[]> {
  const map = new Map<string, GenerateWarning[]>();
  if (!warnings) return map;
  for (const warning of warnings) {
    const workerId = warning.worker_id;
    if (!workerId || !warning.shift_ids?.length) continue;
    for (const shiftId of warning.shift_ids) {
      const key = warningCellKey(shiftId, workerId);
      const bucket = map.get(key);
      if (bucket) bucket.push(warning);
      else map.set(key, [warning]);
    }
  }
  return map;
}
