import cron from 'node-cron';
import mongoose from 'mongoose';
import Constraint from '../models/Constraint';
import SystemSettings from '../models/SystemSettings';
import AuditLog from '../models/AuditLog';
import { getCurrentWeekId, isConstraintDeadlinePassed } from '../utils/weekUtils';

// Nil ObjectId used as performedBy for system-generated audit entries
export const SYSTEM_ACTOR_ID = new mongoose.Types.ObjectId('000000000000000000000000');

async function lockConstraintsForCurrentWeek(): Promise<void> {
  const weekId = getCurrentWeekId();

  if (!isConstraintDeadlinePassed(weekId)) {
    return;
  }

  // Idempotency guard — skip if already locked this week
  const alreadyLocked = await AuditLog.findOne({
    action: 'constraint_window_locked',
    'after.weekId': weekId,
  });
  if (alreadyLocked) return;

  const result = await Constraint.updateMany({ weekId, isLocked: false }, { $set: { isLocked: true } });

  await SystemSettings.findOneAndUpdate(
    { key: 'workflow_state' },
    { $set: { value: 'constraint_locked', updatedAt: new Date() } },
    { upsert: true }
  );

  await AuditLog.create({
    performedBy: SYSTEM_ACTOR_ID,
    action: 'constraint_window_locked',
    after: { weekId, lockedCount: result.modifiedCount },
    ip: 'system',
  });
}

// Exported for direct test invocation — no scheduler dependency
export async function runLockNow(): Promise<void> {
  try {
    await lockConstraintsForCurrentWeek();
  } catch (err) {
    console.error('[cronService] runLockNow failed:', err);
  }
}

export function initCronService(): void {
  // Start-up reconciliation: if deadline already passed and constraints are still unlocked, lock now
  runLockNow().catch(console.error);

  // Monday 21:00 UTC = Tuesday 00:00 IST (1 min after Monday 23:59 IST deadline)
  cron.schedule('0 21 * * 1', () => {
    runLockNow().catch(console.error);
  });
}
