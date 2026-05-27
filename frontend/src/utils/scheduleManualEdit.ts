import type { AdminDashboardAuditLog } from '../pages/admin/types';

const MANUAL_EDIT_ACTIONS = new Set(['assignment_created', 'assignment_deleted']);

export function isScheduleManuallyEdited(
  auditLogs: AdminDashboardAuditLog[] | null | undefined
): boolean {
  if (!auditLogs || auditLogs.length === 0) return false;
  return auditLogs.some((log) => MANUAL_EDIT_ACTIONS.has(log.action));
}
