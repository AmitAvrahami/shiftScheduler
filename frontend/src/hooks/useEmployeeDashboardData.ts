import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assignmentApi,
  scheduleApi,
  shiftApi,
  type Assignment,
  type Schedule,
  type Shift,
} from '../lib/api';
import {
  getCurrentWeekId,
  getWeekDates,
  normalizeConstraintDate,
  toDateKey,
} from '../utils/weekUtils';

export type EmployeeDashboardEmptyReason = 'no_published_schedule' | 'no_assignments';

export interface EmployeeDashboardShift {
  assignmentId: string;
  shiftId: string;
  scheduleId: string;
  definitionId: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
}

export interface EmployeeDashboardDay {
  dateKey: string;
  date: Date;
  shifts: EmployeeDashboardShift[];
  isToday: boolean;
  isNextShiftDay: boolean;
}

export interface EmployeeDashboardData {
  weekId: string;
  schedule: Schedule | null;
  emptyReason: EmployeeDashboardEmptyReason | null;
  nextShift: EmployeeDashboardShift | null;
  weekDays: EmployeeDashboardDay[];
}

const DASHBOARD_ERROR_MESSAGE = 'שגיאה בטעינת נתוני הדשבורד';

function toEmployeeShift(assignment: Assignment, shift: Shift): EmployeeDashboardShift | null {
  const startsAtMs = new Date(shift.startsAt).getTime();
  const endsAtMs = new Date(shift.endsAt).getTime();

  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) {
    return null;
  }

  return {
    assignmentId: assignment._id,
    shiftId: shift._id,
    scheduleId: shift.scheduleId,
    definitionId: shift.definitionId,
    dateKey: normalizeConstraintDate(shift.date),
    startTime: shift.startTime,
    endTime: shift.endTime,
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
  };
}

export function buildEmployeeDashboardData(params: {
  schedules: Schedule[];
  shifts: Shift[];
  assignments: Assignment[];
  weekId: string;
  nowMs: number;
}): EmployeeDashboardData {
  const { schedules, shifts, assignments, weekId, nowMs } = params;
  const schedule =
    schedules.find(
      (candidate) => candidate.weekId === weekId && candidate.status === 'published'
    ) ?? null;
  const weekDates = getWeekDates(weekId);
  const todayKey = toDateKey(new Date(nowMs));

  if (!schedule) {
    return {
      weekId,
      schedule,
      emptyReason: 'no_published_schedule',
      nextShift: null,
      weekDays: weekDates.map((date) => ({
        date,
        dateKey: toDateKey(date),
        shifts: [],
        isToday: toDateKey(date) === todayKey,
        isNextShiftDay: false,
      })),
    };
  }

  const shiftsById = new Map(shifts.map((shift) => [shift._id, shift]));
  const employeeShifts = assignments
    .map((assignment) => {
      const shift = shiftsById.get(assignment.shiftId);
      return shift ? toEmployeeShift(assignment, shift) : null;
    })
    .filter((shift): shift is EmployeeDashboardShift => Boolean(shift))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const nextShift =
    employeeShifts.find((shift) => new Date(shift.startsAt).getTime() > nowMs) ?? null;

  const weekDays = weekDates.map((date) => {
    const dateKey = toDateKey(date);
    const dayShifts = employeeShifts.filter((shift) => shift.dateKey === dateKey);

    return {
      date,
      dateKey,
      shifts: dayShifts,
      isToday: dateKey === todayKey,
      isNextShiftDay: nextShift?.dateKey === dateKey,
    };
  });

  return {
    weekId,
    schedule,
    emptyReason: employeeShifts.length === 0 ? 'no_assignments' : null,
    nextShift,
    weekDays,
  };
}

export function useEmployeeDashboardData(enabled = true) {
  const [data, setData] = useState<EmployeeDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) {
      requestIdRef.current += 1;
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setError(null);

    try {
      const weekId = getCurrentWeekId();
      const schedulesRes = await scheduleApi.getAll();
      const publishedSchedule =
        schedulesRes.schedules.find(
          (schedule) => schedule.weekId === weekId && schedule.status === 'published'
        ) ?? null;

      let shifts: Shift[] = [];
      let assignments: Assignment[] = [];

      if (publishedSchedule) {
        const [shiftsRes, assignmentsRes] = await Promise.all([
          shiftApi.getBySchedule(publishedSchedule._id),
          assignmentApi.getBySchedule(publishedSchedule._id),
        ]);

        shifts = shiftsRes.shifts;
        assignments = assignmentsRes.assignments;
      }

      if (requestIdRef.current !== requestId) return;

      setData(
        buildEmployeeDashboardData({
          schedules: schedulesRes.schedules,
          shifts,
          assignments,
          weekId,
          nowMs: Date.now(),
        })
      );
    } catch {
      if (requestIdRef.current !== requestId) return;
      setError(DASHBOARD_ERROR_MESSAGE);
      setData(null);
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    load();
    return () => {
      requestIdRef.current += 1;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [load]);

  return {
    data,
    loading,
    error,
    reload: load,
  };
}
