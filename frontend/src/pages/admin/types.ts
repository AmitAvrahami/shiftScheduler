export type WeekWorkflowState =
  | 'not_created'
  | 'constraints_open'
  | 'constraints_locked'
  | 'draft'
  | 'published'
  | 'archived';

export type ShiftType = 'morning' | 'afternoon' | 'night' | 'unknown';

export interface AdminDashboardDTO {
  weekId: string;
  scheduleId: string | null;
  scheduleStatus: WeekWorkflowState;

  employees: {
    id: string;
    name: string;
    role: string;
    isActive: boolean;
  }[];

  shifts: {
    id: string;
    day: string;
    type: ShiftType;
    requiredEmployees: number;
  }[];

  assignments: {
    id: string;
    shiftId: string;
    employeeId: string;
  }[];

  missingConstraints: {
    id: string;
    name: string;
  }[];

  kpis: {
    totalShifts: number;
    filledShifts: number;
    missingAssignments: number;
    employeesMissingConstraints: number;
  };

  readiness: {
    canGenerate: boolean;
    hasMissingConstraints: boolean;
    hasNoEmployees: boolean;
    hasNoShifts: boolean;
    warnings: string[];
  };

  auditLogs: {
    id: string;
    action: string;
    createdAt: string;
  }[];
}
