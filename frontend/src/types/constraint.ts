export interface ShiftDefinition {
  _id: string;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  orderNumber: number;
}

export interface ConstraintEntry {
  date: string; // YYYY-MM-DD local time
  definitionId: string;
  canWork: boolean;
}

export interface Constraint {
  _id: string;
  userId: string;
  weekId: string;
  entries: ConstraintEntry[];
  isLocked: boolean;
  submittedVia: 'self' | 'manager_override';
  submittedAt: string;
}
