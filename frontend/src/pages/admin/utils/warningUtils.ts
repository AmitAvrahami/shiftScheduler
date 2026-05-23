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

export function getWarningLabel(warning: GenerateWarning): string {
  const key = warning.type ?? warning.constraint_id;
  if (key && WARNING_TYPE_LABELS[key]) return WARNING_TYPE_LABELS[key];
  return warning.message;
}

export function getWarningSeverity(warning: GenerateWarning): 'info' | 'warning' {
  return warning.severity === 'info' ? 'info' : 'warning';
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
