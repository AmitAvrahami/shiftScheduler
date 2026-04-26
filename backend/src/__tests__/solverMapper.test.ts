import mongoose from 'mongoose';
import {
  toSolveRequest,
  toAssignmentDocs,
  calculateShiftStatus,
  SchedulerInput,
  LeanSchedule,
  LeanUser,
  LeanShift,
  LeanShiftDefinition,
  LeanConstraint,
} from '../services/solverMapper';
import { SolveResult } from '../services/solverClient';

const id = (hex: string) => new mongoose.Types.ObjectId(hex.padStart(24, '0'));

const scheduleId = id('1');
const defId = id('2');
const shiftId = id('3');
const userId = id('4');
const userId2 = id('5');

const baseSchedule: LeanSchedule = {
  _id: scheduleId,
  weekId: '2026-W20',
};

const baseEmployee: LeanUser = {
  _id: userId,
  role: 'employee',
  isFixedMorningEmployee: false,
};

const baseManager: LeanUser = {
  _id: userId2,
  role: 'manager',
  isFixedMorningEmployee: false,
};

const baseDefinition: LeanShiftDefinition = {
  _id: defId,
  name: 'Morning',
  startTime: '06:45',
  endTime: '14:45',
  durationMinutes: 480,
  crossesMidnight: false,
};

// IST local midnight for 2026-05-10 (Sun) — stored as local midnight Date
const shiftDate = new Date(2026, 4, 10, 0, 0, 0, 0); // month is 0-indexed

const baseShift: LeanShift = {
  _id: shiftId,
  date: shiftDate,
  definitionId: defId,
  requiredCount: 2,
};

function makeInput(overrides: Partial<SchedulerInput> = {}): SchedulerInput {
  return {
    schedule: baseSchedule,
    workers: [baseEmployee],
    shifts: [baseShift],
    shiftDefinitions: [baseDefinition],
    constraints: [],
    ...overrides,
  };
}

describe('toSolveRequest', () => {
  it('maps schedule_id and week_id correctly', () => {
    const req = toSolveRequest(makeInput());
    expect(req.schedule_id).toBe(scheduleId.toString());
    expect(req.week_id).toBe('2026-W20');
  });

  it('maps worker id, role, and is_fixed_morning', () => {
    const req = toSolveRequest(makeInput());
    expect(req.workers).toHaveLength(1);
    expect(req.workers[0].id).toBe(userId.toString());
    expect(req.workers[0].role).toBe('employee');
    expect(req.workers[0].is_fixed_morning).toBe(false);
  });

  it('maps manager role correctly', () => {
    const req = toSolveRequest(makeInput({ workers: [baseManager] }));
    expect(req.workers[0].role).toBe('manager');
  });

  it('maps admin role to manager for solver compatibility', () => {
    const adminUser: LeanUser = { ...baseEmployee, role: 'admin' };
    const req = toSolveRequest(makeInput({ workers: [adminUser] }));
    expect(req.workers[0].role).toBe('manager');
  });

  it('maps is_fixed_morning true when set', () => {
    const fixedUser: LeanUser = { ...baseEmployee, isFixedMorningEmployee: true };
    const req = toSolveRequest(makeInput({ workers: [fixedUser] }));
    expect(req.workers[0].is_fixed_morning).toBe(true);
  });

  it('produces empty availability for a worker with no constraint document', () => {
    const req = toSolveRequest(makeInput({ constraints: [] }));
    expect(req.workers[0].availability).toEqual([]);
  });

  it('maps availability from constraint entries using local-time date key', () => {
    const constraint: LeanConstraint = {
      userId,
      entries: [
        { date: shiftDate, definitionId: defId, canWork: false },
      ],
    };
    const req = toSolveRequest(makeInput({ constraints: [constraint] }));
    const avail = req.workers[0].availability;
    expect(avail).toHaveLength(1);
    // toDateKey uses local time: month 4 (May) → "2026-05-10"
    expect(avail[0].date).toBe('2026-05-10');
    expect(avail[0].definition_id).toBe(defId.toString());
    expect(avail[0].can_work).toBe(false);
  });

  it('uses local-time date key for availability (never toISOString)', () => {
    const constraint: LeanConstraint = {
      userId,
      entries: [{ date: shiftDate, definitionId: defId, canWork: true }],
    };
    const req = toSolveRequest(makeInput({ constraints: [constraint] }));
    // If toISOString() were used in UTC+0, local midnight on May 10 might serialize as "2026-05-09"
    // toDateKey guarantees local date
    expect(req.workers[0].availability[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const parts = req.workers[0].availability[0].date.split('-').map(Number);
    // year=2026, month=05, day=10 — exactly as constructed
    expect(parts[0]).toBe(2026);
    expect(parts[1]).toBe(5);
    expect(parts[2]).toBe(10);
  });

  it('maps shift_definitions with all fields', () => {
    const req = toSolveRequest(makeInput());
    expect(req.shift_definitions).toHaveLength(1);
    const d = req.shift_definitions[0];
    expect(d.id).toBe(defId.toString());
    expect(d.name).toBe('Morning');
    expect(d.start_time).toBe('06:45');
    expect(d.end_time).toBe('14:45');
    expect(d.duration_minutes).toBe(480);
    expect(d.crosses_midnight).toBe(false);
  });

  it('maps shifts with local-time date key', () => {
    const req = toSolveRequest(makeInput());
    expect(req.shifts).toHaveLength(1);
    const s = req.shifts[0];
    expect(s.id).toBe(shiftId.toString());
    expect(s.date).toBe('2026-05-10');
    expect(s.definition_id).toBe(defId.toString());
    expect(s.required_count).toBe(2);
  });

  it('matches constraint availability to the correct worker by userId', () => {
    const constraint1: LeanConstraint = {
      userId,
      entries: [{ date: shiftDate, definitionId: defId, canWork: false }],
    };
    const constraint2: LeanConstraint = {
      userId: userId2,
      entries: [{ date: shiftDate, definitionId: defId, canWork: true }],
    };
    const req = toSolveRequest(
      makeInput({ workers: [baseEmployee, baseManager], constraints: [constraint1, constraint2] })
    );
    const emp = req.workers.find((w) => w.id === userId.toString())!;
    const mgr = req.workers.find((w) => w.id === userId2.toString())!;
    expect(emp.availability[0].can_work).toBe(false);
    expect(mgr.availability[0].can_work).toBe(true);
  });
});

describe('toAssignmentDocs', () => {
  const mockResult: SolveResult = {
    status: 'OPTIMAL',
    assignments: [
      { shift_id: shiftId.toString(), worker_id: userId.toString(), assigned_by: 'algorithm' },
    ],
    violations: [],
    warnings: [],
    solve_time_ms: 42,
  };

  it('maps each assignment to a DB insert doc', () => {
    const docs = toAssignmentDocs(mockResult, scheduleId.toString());
    expect(docs).toHaveLength(1);
    expect(docs[0].shiftId).toBe(shiftId.toString());
    expect(docs[0].userId).toBe(userId.toString());
    expect(docs[0].scheduleId).toBe(scheduleId.toString());
  });

  it('hardcodes assignedBy to algorithm and status to pending', () => {
    const docs = toAssignmentDocs(mockResult, scheduleId.toString());
    expect(docs[0].assignedBy).toBe('algorithm');
    expect(docs[0].status).toBe('pending');
  });

  it('returns empty array when result has no assignments', () => {
    const emptyResult: SolveResult = { ...mockResult, assignments: [] };
    expect(toAssignmentDocs(emptyResult, scheduleId.toString())).toEqual([]);
  });
});

describe('calculateShiftStatus', () => {
  it('returns empty when assigned count is 0', () => {
    expect(calculateShiftStatus(2, 0)).toBe('empty');
  });

  it('returns partial when assigned < required', () => {
    expect(calculateShiftStatus(3, 1)).toBe('partial');
    expect(calculateShiftStatus(2, 1)).toBe('partial');
  });

  it('returns filled when assigned equals required', () => {
    expect(calculateShiftStatus(2, 2)).toBe('filled');
  });

  it('returns filled when assigned exceeds required', () => {
    expect(calculateShiftStatus(2, 3)).toBe('filled');
  });
});
