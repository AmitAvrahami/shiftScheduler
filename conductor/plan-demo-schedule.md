# Demo Schedule Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a demo schedule generation flow that skips constraints and fills shifts sequentially for testing the frontend.

**Architecture:** Create a separate `POST /api/schedules/:weekId/generate-demo` endpoint and a dedicated `demoSchedulerService.ts` to keep the logic isolated from the production Python solver.

**Tech Stack:** Node.js, Express, TypeScript, Mongoose, React.

---

### Task 1: Create Demo Scheduler Service

**Files:**
- Create: `backend/src/services/demoSchedulerService.ts`

- [ ] **Step 1: Write the minimal implementation**

```typescript
import mongoose from 'mongoose';
import WeeklySchedule from '../models/WeeklySchedule';
import Shift from '../models/Shift';
import User from '../models/User';
import Assignment from '../models/Assignment';
import AuditLog from '../models/AuditLog';
import AppError from '../utils/AppError';
import { calculateShiftStatus } from './solverMapper';

export interface SchedulerResult {
  status: 'OPTIMAL' | 'FEASIBLE' | 'RELAXED' | 'INFEASIBLE';
  assignmentCount: number;
  warnings: any[];
  violations: any[];
  solveTimeMs: number;
}

export async function runDemoScheduler(
  weekId: string,
  actorId: mongoose.Types.ObjectId,
  ip: string
): Promise<SchedulerResult> {
  const startTime = Date.now();
  
  const schedule = await WeeklySchedule.findOne({ weekId }).lean();
  if (!schedule) throw new AppError(`Schedule not found for week ${weekId}`, 404);
  
  const scheduleId = schedule._id as mongoose.Types.ObjectId;

  const [shifts, workers] = await Promise.all([
    Shift.find({ scheduleId }).lean(),
    User.find({ isActive: true, role: { $in: ['employee', 'manager'] } }).lean(),
  ]);

  if (shifts.length === 0) throw new AppError('No shifts found for this schedule', 422);
  if (workers.length === 0) throw new AppError('No active workers found', 422);

  await Assignment.deleteMany({ scheduleId, assignedBy: 'algorithm' });

  // Simple round-robin logic
  const assignmentDocs: any[] = [];
  const countByShift: Record<string, number> = {};
  
  // Sort shifts by date and shiftType (morning, afternoon, night)
  const sortedShifts = [...shifts].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  // Map of worker ID to their total assigned shifts
  const shiftCounts = new Map<string, number>(workers.map(w => [w._id.toString(), 0]));
  
  for (const shift of sortedShifts) {
    const shiftIdStr = shift._id.toString();
    const dateStr = new Date(shift.date).toISOString().split('T')[0];
    
    let needed = shift.requiredCount;
    if (needed === 0) continue;
    
    // Demo overrides for needed capacity
    // Sun-Thu: 2/2/1, Fri: 2/1/1, Sat: 1/1/1
    const dayOfWeek = new Date(shift.date).getDay();
    if (dayOfWeek >= 0 && dayOfWeek <= 4) { // Sun-Thu
      if (shift.type === 'morning') needed = 2;
      if (shift.type === 'afternoon') needed = 2;
      if (shift.type === 'night') needed = 1;
    } else if (dayOfWeek === 5) { // Fri
      if (shift.type === 'morning') needed = 2;
      if (shift.type === 'afternoon') needed = 1;
      if (shift.type === 'night') needed = 1;
    } else if (dayOfWeek === 6) { // Sat
      if (shift.type === 'morning') needed = 1;
      if (shift.type === 'afternoon') needed = 1;
      if (shift.type === 'night') needed = 1;
    }

    countByShift[shiftIdStr] = 0;
    
    for (let i = 0; i < needed; i++) {
      // Find worker with least shifts who isn't already assigned today
      let bestWorker = null;
      let minShifts = Infinity;
      
      for (const worker of workers) {
        const workerIdStr = worker._id.toString();
        // Check if assigned today
        const assignedToday = assignmentDocs.some(a => 
           a.userId.toString() === workerIdStr && 
           a._dateStr === dateStr
        );
        
        if (assignedToday) continue;
        
        const count = shiftCounts.get(workerIdStr) || 0;
        if (count < minShifts) {
          minShifts = count;
          bestWorker = worker;
        }
      }
      
      if (bestWorker) {
        assignmentDocs.push({
          shiftId: shift._id,
          userId: bestWorker._id,
          scheduleId: scheduleId,
          assignedBy: 'algorithm',
          status: 'pending',
          _dateStr: dateStr // temp for checking today
        });
        shiftCounts.set(bestWorker._id.toString(), minShifts + 1);
        countByShift[shiftIdStr]++;
      }
    }
  }

  // Remove temporary _dateStr
  const finalDocs = assignmentDocs.map(({ _dateStr, ...rest }) => rest);

  if (finalDocs.length > 0) {
    await Assignment.insertMany(finalDocs);
  }

  const bulkOps = shifts.map((shift) => ({
    updateOne: {
      filter: { _id: shift._id },
      update: {
        $set: {
          status: calculateShiftStatus(
            shift.requiredCount,
            countByShift[shift._id.toString()] ?? 0
          ),
        },
      },
    },
  }));
  if (bulkOps.length > 0) {
    await Shift.bulkWrite(bulkOps);
  }

  await AuditLog.create({
    performedBy: actorId,
    action: 'schedule_generated',
    refModel: 'WeeklySchedule',
    refId: scheduleId,
    after: {
      weekId,
      solverStatus: 'FEASIBLE',
      assignmentCount: finalDocs.length,
      solveTimeMs: Date.now() - startTime,
      warnings: [],
      violations: [],
      demoMode: true
    },
    ip,
  });

  return {
    status: 'FEASIBLE',
    assignmentCount: finalDocs.length,
    warnings: [],
    violations: [],
    solveTimeMs: Date.now() - startTime,
  };
}
```

### Task 2: Update Controller & Routes

**Files:**
- Modify: `backend/src/controllers/scheduleController.ts`
- Modify: `backend/src/routes/schedule.routes.ts`

- [ ] **Step 1: Add demo controller method**

In `scheduleController.ts`, add the new import and function:

```typescript
import { runDemoScheduler } from '../services/demoSchedulerService';

export async function generateDemoSchedule(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('generateDemoSchedule - start', { weekId: req.params.weekId });
  try {
    const { weekId } = req.params;
    if (!validateWeekId(weekId, next)) return;

    const actorId = new mongoose.Types.ObjectId(req.user!._id as string);
    const ip = req.ip ?? 'unknown';

    let schedule = await WeeklySchedule.findOne({ weekId });
    if (!schedule) {
      await assertActiveShiftTemplates();
      const dates = getWeekDates(weekId);
      schedule = await WeeklySchedule.create({
        weekId,
        startDate: dates[0],
        endDate: dates[6],
        status: 'open',
        generatedBy: 'auto',
      });
    }

    await fillMissingTemplateShifts(weekId, actorId, ip);
    await WeeklySchedule.findOneAndUpdate({ weekId }, { $set: { status: 'generating' } });

    let result;
    try {
      result = await runDemoScheduler(weekId, actorId, ip);
      await WeeklySchedule.findOneAndUpdate({ weekId }, { $set: { status: 'draft' } });
    } catch (solverErr) {
      await WeeklySchedule.findOneAndUpdate({ weekId }, { $set: { status: 'locked' } });
      throw solverErr;
    }

    res.json({ success: true, ...result });
    logger.info('generateDemoSchedule - end', { weekId: req.params.weekId });
  } catch (err) {
    logger.error('generateDemoSchedule - error', err);
    next(err);
  }
}
```

- [ ] **Step 2: Add route**

In `schedule.routes.ts`, import `generateDemoSchedule` and add:

```typescript
router.post('/:weekId/generate-demo', verifyToken, isManager, generateDemoSchedule);
```

### Task 3: Update Frontend API & Hook

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/pages/admin/hooks/useAdminDashboard.ts`

- [ ] **Step 1: Add API method**

In `api.ts`, add:

```typescript
  generateDemo(weekId: string): Promise<GenerateResult> {
    return request(`/schedules/${weekId}/generate-demo`, { method: 'POST' });
  },
```

- [ ] **Step 2: Add hook function**

In `useAdminDashboard.ts`, add:

```typescript
  const generateDemoSchedule = useCallback(async () => {
    if (!weekId) return;
    setActionLoading('generate');
    try {
      const result = await scheduleApi.generateDemo(weekId);
      setGenerateResult(result);
      await loadDashboard();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to generate demo schedule'));
    } finally {
      setActionLoading(null);
    }
  }, [weekId, loadDashboard]);
```
Export it in the returned actions object.

### Task 4: Add Button to UI

**Files:**
- Modify: `frontend/src/pages/admin/components/QuickActionsPanel.tsx`
- Modify: `frontend/src/pages/AdminDashboardPage.tsx`

- [ ] **Step 1: Add props and UI button**

In `QuickActionsPanel.tsx`, add `onGenerateDemo: () => Promise<GenerateResult | undefined>;` to props.

Add to `actions` array:
```typescript
    {
      id: 'generate-demo',
      label: 'צור סידור דמו',
      icon: 'science',
      onClick: async () => await onGenerateDemo(),
      variant: 'secondary' as const,
      disabled: !canGenerate,
    },
```

In `AdminDashboardPage.tsx`, pass `onGenerateDemo={actions.generateDemoSchedule}` to `QuickActionsPanel`.