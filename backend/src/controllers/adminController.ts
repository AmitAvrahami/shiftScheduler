import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import User from '../models/User';
import WeeklySchedule from '../models/WeeklySchedule';
import AuditLog from '../models/AuditLog';
import Constraint from '../models/Constraint';
import ShiftDefinition from '../models/ShiftDefinition';
import { getCurrentWeekId, getNextWeekId } from '../utils/weekUtils';
import AppError from '../utils/AppError';
import { generateWeekShifts, initializeWeeklySchedule } from '../services/shiftGenerationService';
import type { DashboardResponse, CurrentWeekStats } from '../types/admin';
import { logger } from '../utils/logger';

const WEEK_ID_RE = /^\d{4}-W\d{2}$/;
const weekIdParamSchema = z.object({
  weekId: z.string().regex(WEEK_ID_RE, 'Invalid weekId format — expected YYYY-WNN'),
});

const initializeSchema = z.object({
  weekId: z.string().regex(WEEK_ID_RE, 'Invalid weekId format — expected YYYY-WNN'),
  generatedBy: z.enum(['auto', 'manual']).optional().default('auto'),
});

export async function initializeWeek(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('initializeWeek - start', { body: req.body });
  try {
    const parsed = initializeSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }
    const actorId = new mongoose.Types.ObjectId(req.user!._id as string);
    const { weekId, generatedBy } = parsed.data;

    const result = await initializeWeeklySchedule(weekId, generatedBy, actorId, req.ip ?? 'unknown');
    res.status(201).json({ success: true, ...result });
    logger.info('initializeWeek - end', { weekId });
  } catch (err) {
    logger.error('initializeWeek - error', err);
    next(err);
  }
}

export async function generateShifts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  logger.info('generateShifts - start', { weekId: req.params.weekId });
  try {
    const parsed = weekIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      return next(new AppError(parsed.error.errors[0].message, 400));
    }
    const actorId = new mongoose.Types.ObjectId(req.user!._id as string);
    const result = await generateWeekShifts(parsed.data.weekId, actorId, req.ip ?? 'unknown');
    res.status(201).json({ success: true, ...result });
    logger.info('generateShifts - end', { weekId: parsed.data.weekId });
  } catch (err) {
    logger.error('generateShifts - error', err);
    next(err);
  }
}

export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  logger.info('getDashboard - start', { query: req.query });
  const t0 = Date.now();

  try {
    const weekId = (req.query.weekId as string | undefined) || getCurrentWeekId();
    const nextWeekId = getNextWeekId(weekId);

    const [userFacet, scheduleFacet, constraintDocs, auditDocs, shiftDefDocs] = await Promise.all([

      // ── Pipeline 1: Users ──────────────────────────────────────────────────
      // Single $facet: full user list (no password) + aggregated stats
      User.aggregate<{
        all: Record<string, unknown>[];
        stats: Array<{ total: number; active: number; employees: number; managers: number; admins: number }>;
      }>([
        {
          $facet: {
            all: [{ $project: { password: 0 } }],
            stats: [
              {
                $group: {
                  _id: null,
                  total:     { $sum: 1 },
                  active:    { $sum: { $cond: ['$isActive', 1, 0] } },
                  employees: { $sum: { $cond: [{ $eq: ['$role', 'employee'] }, 1, 0] } },
                  managers:  { $sum: { $cond: [{ $eq: ['$role', 'manager'] }, 1, 0] } },
                  admins:    { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
                },
              },
            ],
          },
        },
      ]),

      // ── Pipeline 2: Current-week schedule + shifts + assignments ───────────
      // $match the schedule, then $facet with $lookup to avoid N rounds trips.
      // Each facet is independent so shifts and assignments are fetched in parallel
      // within the same aggregation.
      WeeklySchedule.aggregate<{
        schedule: Record<string, unknown>[];
        shifts: Record<string, unknown>[];
        assignments: Record<string, unknown>[];
      }>([
        { $match: { weekId } },
        {
          $facet: {
            schedule: [{ $limit: 1 }],

            shifts: [
              {
                $lookup: {
                  from: 'shifts',
                  localField: '_id',
                  foreignField: 'scheduleId',
                  as: 'shiftDocs',
                },
              },
              { $unwind: '$shiftDocs' },
              { $replaceRoot: { newRoot: '$shiftDocs' } },
            ],

            assignments: [
              {
                $lookup: {
                  from: 'assignments',
                  localField: '_id',
                  foreignField: 'scheduleId',
                  as: 'assignmentDocs',
                },
              },
              { $unwind: '$assignmentDocs' },
              { $replaceRoot: { newRoot: '$assignmentDocs' } },
            ],
          },
        },
      ]),

      // ── Pipeline 3: Submitted constraints for next week ────────────────────
      // One query replaces the previous N+1 pattern (one call per employee).
      Constraint.aggregate<{ userId: unknown }>([
        { $match: { weekId: nextWeekId } },
        { $project: { _id: 0, userId: 1 } },
      ]),

      // ── Pipeline 4: Recent audit logs with $lookup for performer name ──────
      // $lookup replaces .populate() — no extra round-trip to Node.js.
      AuditLog.aggregate<Record<string, unknown>>([
        { $sort: { createdAt: -1 } },
        { $limit: 8 },
        {
          $lookup: {
            from: 'users',
            localField: 'performedBy',
            foreignField: '_id',
            as: 'performerDoc',
          },
        },
        {
          $project: {
            action: 1,
            createdAt: 1,
            ip: 1,
            performedBy: {
              $cond: {
                if: { $gt: [{ $size: '$performerDoc' }, 0] },
                then: {
                  _id:  { $arrayElemAt: ['$performerDoc._id',  0] },
                  name: { $arrayElemAt: ['$performerDoc.name', 0] },
                },
                else: '$performedBy',
              },
            },
          },
        },
      ]),

      // ── Pipeline 5: Active shift definitions ──────────────────────────────
      ShiftDefinition.aggregate<Record<string, unknown>>([
        { $match: { isActive: true } },
        { $sort: { orderNumber: 1 } },
      ]),
    ]);

    const queryTimeMs = Date.now() - t0;
    logger.info('getDashboard - query complete', { weekId, queryTimeMs });

    // ── Shape users ──────────────────────────────────────────────────────────
    const { all: allUsers, stats: statsArr } = userFacet[0] ?? { all: [], stats: [] };
    const rawStats = statsArr[0] ?? { total: 0, active: 0, employees: 0, managers: 0, admins: 0 };

    // ── Shape current-week data ──────────────────────────────────────────────
    const { schedule: scheduleDocs, shifts, assignments } = scheduleFacet[0] ?? {
      schedule: [], shifts: [], assignments: [],
    };
    const schedule = scheduleDocs[0] ?? null;

    const weekStats: CurrentWeekStats = {
      total:   shifts.length,
      filled:  shifts.filter((s) => s.status === 'filled').length,
      partial: shifts.filter((s) => s.status === 'partial').length,
      empty:   shifts.filter((s) => s.status === 'empty').length,
      scheduleStatus: schedule ? (schedule.status as string) : null,
    };

    // ── Compute missing constraints via set-difference ───────────────────────
    const submittedSet = new Set(constraintDocs.map((c) => String(c.userId)));
    const missingConstraintUserIds = allUsers
      .filter((u) => (u as { role: string; isActive: boolean }).role === 'employee'
                  && (u as { role: string; isActive: boolean }).isActive)
      .map((u) => String((u as { _id: unknown })._id))
      .filter((id) => !submittedSet.has(id));

    const body: DashboardResponse = {
      success: true,
      data: {
        users: {
          all: allUsers,
          stats: {
            total:  rawStats.total,
            active: rawStats.active,
            byRole: {
              employee: rawStats.employees,
              manager:  rawStats.managers,
              admin:    rawStats.admins,
            },
          },
        },
        shiftDefinitions: shiftDefDocs,
        currentWeek: {
          weekId,
          schedule,
          shifts,
          assignments,
          stats: weekStats,
        },
        nextWeek: {
          weekId: nextWeekId,
          missingConstraintUserIds,
        },
        recentAuditLogs: auditDocs as unknown as DashboardResponse['data']['recentAuditLogs'],
        meta: { queryTimeMs },
      },
    };

    res.status(200).json(body);
    logger.info('getDashboard - end', { weekId });
  } catch (err) {
    logger.error('getDashboard - error', err);
    next(err);
  }
}
