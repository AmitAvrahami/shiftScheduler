export interface ShiftDefinition {
  _id: string;
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  durationMinutes: number;
  crossesMidnight: boolean;
  color: string;
  isActive: boolean;
  orderNumber: number;
  requiredStaffCount: number;
}

export interface ConstraintEntry {
  date: string; // YYYY-MM-DD local time
  definitionId: string;
  canWork: boolean;
}

export interface Constraint {
  _id: string;
  userId: string | { _id: string; name: string; email: string; avatarUrl?: string };
  weekId: string;
  entries: ConstraintEntry[];
  isLocked: boolean;
  submittedVia: 'self' | 'manager_override';
  submittedAt: string;
}
