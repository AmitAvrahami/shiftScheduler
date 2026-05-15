import mongoose from 'mongoose';
import { compileConstraints } from '../services/compiler/compileConstraints';
import { toSolveRequest } from '../services/solverMapper';
import type {
  LeanConstraint,
  LeanShift,
  LeanShiftDefinition,
  LeanUser,
  LeanSchedule,
} from '../services/solverMapper';
import {
  RELAXATION_WEIGHTS,
  constraintId,
  weight,
  workerId,
  type CalendarDateString,
  type SoftConstraint,
} from '../types/constraint';

const id = (hex: string) => new mongoose.Types.ObjectId(hex.padStart(24, '0'));

const scheduleId = id('e1');
const userA = id('a1');
const userB = id('a2');
const defMorning = id('b1');
const defNight = id('b2');
const shiftMorning = id('c1');
const shiftNight = id('c2');

const sunday = new Date(2026, 4, 10, 0, 0, 0, 0);
const monday = new Date(2026, 4, 11, 0, 0, 0, 0);

const schedule: LeanSchedule = { _id: scheduleId, weekId: '2026-W20' };

const workers: LeanUser[] = [
  { _id: userA, role: 'employee', isFixedMorningEmployee: false },
  { _id: userB, role: 'manager', isFixedMorningEmployee: false },
];

const shiftDefinitions: LeanShiftDefinition[] = [
  {
    _id: defMorning,
    name: 'Morning',
    startTime: '06:45',
    endTime: '14:45',
    durationMinutes: 480,
    crossesMidnight: false,
  },
  {
    _id: defNight,
    name: 'Night',
    startTime: '22:45',
    endTime: '06:45',
    durationMinutes: 480,
    crossesMidnight: true,
  },
];

const shifts: LeanShift[] = [
  { _id: shiftMorning, date: sunday, definitionId: defMorning, requiredCount: 2 },
  { _id: shiftNight, date: monday, definitionId: defNight, requiredCount: 1 },
];

const constraints: LeanConstraint[] = [
  {
    userId: userA,
    entries: [
      { date: sunday, definitionId: defMorning, canWork: false },
      { date: monday, definitionId: defNight, canWork: true },
    ],
  },
];

const assignmentPreference: SoftConstraint = {
  id: constraintId('assignment-pref-1'),
  kind: 'soft',
  category: 'assignment_preference',
  weight: weight(25),
  targets: {
    scope: 'all',
    targets: [
      { kind: 'employee', employeeId: workerId(userA.toString()) },
      {
        kind: 'slot',
        date: '2026-05-10' as CalendarDateString,
        definitionId: defMorning.toString(),
      },
    ],
  },
  source: { type: 'employee', actorId: workerId(userA.toString()) },
};

describe('compileConstraints', () => {
  it('emits a generic payload with forbidden cells for hard availability', () => {
    const out = compileConstraints({
      weekId: schedule.weekId,
      workers,
      shifts,
      shiftDefinitions,
      constraints,
    });

    expect(out.generic.forbidden_assignments).toEqual([
      { worker_id: userA.toString(), shift_id: shiftMorning.toString() },
    ]);
    expect(out.generic.penalties).toEqual([]);
    expect(out.generic.relaxation_weights).toEqual({
      load: RELAXATION_WEIGHTS.load,
      coverage: RELAXATION_WEIGHTS.coverage,
    });
  });

  it('exposes the normalized domain constraints', () => {
    const out = compileConstraints({
      weekId: schedule.weekId,
      workers,
      shifts,
      shiftDefinitions,
      constraints,
    });
    expect(out.normalized).toHaveLength(1);
    expect(out.normalized[0]).toMatchObject({
      kind: 'hard',
      category: 'availability',
    });
  });

  it('produces an availability map byte-for-byte identical to the legacy toSolveRequest path', () => {
    const out = compileConstraints({
      weekId: schedule.weekId,
      workers,
      shifts,
      shiftDefinitions,
      constraints,
    });

    const legacyReq = toSolveRequest({
      schedule,
      workers,
      shifts,
      shiftDefinitions,
      constraints,
    });
    const compiledReq = toSolveRequest(
      { schedule, workers, shifts, shiftDefinitions, constraints },
      out.availabilityByWorker
    );

    expect(compiledReq).toEqual(legacyReq);
  });

  it('returns an empty availability map when no constraint docs exist', () => {
    const out = compileConstraints({
      weekId: schedule.weekId,
      workers,
      shifts,
      shiftDefinitions,
      constraints: [],
    });
    expect(out.availabilityByWorker.size).toBe(0);
    expect(out.generic.forbidden_assignments).toEqual([]);
    expect(out.generic.penalties).toEqual([]);
  });

  it('emits generic penalties for supplied domain-level assignment preferences', () => {
    const out = compileConstraints({
      weekId: schedule.weekId,
      workers,
      shifts,
      shiftDefinitions,
      constraints: [],
      domainConstraints: [assignmentPreference],
    });

    expect(out.generic.penalties).toEqual([
      {
        worker_id: userA.toString(),
        shift_id: shiftMorning.toString(),
        category: 'assignment_preference',
        weight: 25,
      },
    ]);
  });
});
