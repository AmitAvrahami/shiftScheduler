export type WeekWorkflowState =
  | 'not_created'
  | 'constraints_open'
  | 'constraints_locked'
  | 'draft'
  | 'published'
  | 'archived';

export type ShiftType = 'morning' | 'afternoon' | 'night' | 'unknown';

export interface AdminDashboardEmployee {
  id: string;
  name: string;
  role: string;
  isActive: boolean;
  isFixedMorningEmployee?: boolean;
}

export interface AdminDashboardShift {
  id: string;
  day: string;
  type: ShiftType;
  requiredEmployees: number;
}

export interface AdminDashboardAssignment {
  id: string;
  shiftId: string;
  employeeId: string;
}

export interface AdminDashboardMissingConstraint {
  id: string;
  name: string;
}

export interface AdminDashboardKpis {
  totalShifts: number;
  filledShifts: number;
  missingAssignments: number;
  employeesMissingConstraints: number;
}

export interface AdminDashboardReadiness {
  canGenerate: boolean;
  hasMissingConstraints: boolean;
  hasNoEmployees: boolean;
  hasNoShifts: boolean;
  warnings: string[];
}

export interface AdminDashboardAuditLog {
  id: string;
  action: string;
  createdAt: string;
}

export interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface AdminDashboardDTO {
  weekId: string;
  scheduleId: string | null;
  scheduleStatus: WeekWorkflowState;

  employees: AdminDashboardEmployee[];
  shifts: AdminDashboardShift[];
  assignments: AdminDashboardAssignment[];
  missingConstraints: AdminDashboardMissingConstraint[];

  kpis: AdminDashboardKpis;
  readiness: AdminDashboardReadiness;
  auditLogs: AdminDashboardAuditLog[];
}
