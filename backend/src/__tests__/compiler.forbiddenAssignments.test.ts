import mongoose from 'mongoose';
import {
  buildForbiddenAssignments,
  type CompilerContext,
} from '../services/compiler/forbiddenAssignmentsBuilder';
import type { LeanShift, LeanShiftDefinition, LeanUser } from '../services/solverMapper';
import type { CalendarDateString, Constraint, HardConstraint } from '../types/constraint';
import { constraintId, workerId } from '../types/constraint';

const id = (hex: string) => new mongoose.Types.ObjectId(hex.padStart(24, '0'));

const userA = id('a1');
const defMorning = id('b1');
const defNight = id('b2');
const shiftA = id('c1');
const shiftB = id('c2');

const sunday = new Date(2026, 4, 10, 0, 0, 0, 0);

const baseWorker: LeanUser = {
  _id: userA,
  role: 'employee',
  isFixedMorningEmployee: false,
};

const baseDefinition: LeanShiftDefinition = {
  _id: defMorning,
  name: 'Morning',
  startTime: '06:45',
  endTime: '14:45',
  durationMinutes: 480,
  crossesMidnight: false,
};

const baseShift: LeanShift = {
  _id: shiftA,
  date: sunday,
  definitionId: defMorning,
  requiredCount: 2,
};

function makeAvailabilityConstraint(opts: {
  workerIdStr: string;
  date: CalendarDateString;
  definitionIdStr: string;
}): HardConstraint {
  return {
    id: constraintId(`${opts.workerIdStr}:2026-W20:${opts.date}:${opts.definitionIdStr}`),
    kind: 'hard',
    category: 'availability',
    targets: {
      scope: 'all',
      targets: [
        { kind: 'employee', employeeId: workerId(opts.workerIdStr) },
        { kind: 'slot', date: opts.date, definitionId: opts.definitionIdStr },
      ],
    },
    source: { type: 'employee', actorId: workerId(opts.workerIdStr) },
  };
}

function makeContext(overrides: Partial<CompilerContext> = {}): CompilerContext {
  return {
    workers: [baseWorker],
    shifts: [baseShift],
    shiftDefinitions: [baseDefinition],
    ...overrides,
  };
}

describe('buildForbiddenAssignments', () => {
  it('returns [] when there are no constraints', () => {
    expect(buildForbiddenAssignments([], makeContext())).toEqual([]);
  });

  it('emits one forbidden cell when employee+slot match a shift', () => {
    const c = makeAvailabilityConstraint({
      workerIdStr: userA.toString(),
      date: '2026-05-10' as CalendarDateString,
      definitionIdStr: defMorning.toString(),
    });
    const out = buildForbiddenAssignments([c], makeContext());
    expect(out).toEqual([{ worker_id: userA.toString(), shift_id: shiftA.toString() }]);
  });

  it('returns [] when no shift matches the slot target', () => {
    const c = makeAvailabilityConstraint({
      workerIdStr: userA.toString(),
      date: '2026-05-10' as CalendarDateString,
      definitionIdStr: defNight.toString(), // mismatch
    });
    expect(buildForbiddenAssignments([c], makeContext())).toEqual([]);
  });

  it('emits multiple forbidden cells when several shifts share the same (date, definition)', () => {
    const extraShift: LeanShift = { ...baseShift, _id: shiftB, requiredCount: 1 };
    const c = makeAvailabilityConstraint({
      workerIdStr: userA.toString(),
      date: '2026-05-10' as CalendarDateString,
      definitionIdStr: defMorning.toString(),
    });
    const out = buildForbiddenAssignments([c], makeContext({ shifts: [baseShift, extraShift] }));
    expect(out).toHaveLength(2);
    const ids = out.map((o) => o.shift_id).sort();
    expect(ids).toEqual([shiftA.toString(), shiftB.toString()].sort());
  });

  it('skips constraints whose employee target is not in the worker set', () => {
    const ghostUserId = id('ff');
    const c = makeAvailabilityConstraint({
      workerIdStr: ghostUserId.toString(),
      date: '2026-05-10' as CalendarDateString,
      definitionIdStr: defMorning.toString(),
    });
    expect(buildForbiddenAssignments([c], makeContext())).toEqual([]);
  });

  it('throws on unsupported hard categories (HC1, HC3–HC7)', () => {
    const minRest: Constraint = {
      id: constraintId('x'),
      kind: 'hard',
      category: 'min_rest',
      targets: {
        scope: 'all',
        targets: [{ kind: 'employee', employeeId: workerId(userA.toString()) }],
      },
      source: { type: 'system' },
    };
    expect(() => buildForbiddenAssignments([minRest], makeContext())).toThrow(
      /min_rest.*not yet supported/
    );
  });
});
