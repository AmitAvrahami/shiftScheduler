import mongoose from 'mongoose';
import { buildPenalties } from '../services/compiler/penaltiesBuilder';
import type { CalendarDateString, Constraint, SoftConstraint } from '../types/constraint';
import { constraintId, weight, workerId } from '../types/constraint';
import type { LeanShift, LeanShiftDefinition, LeanUser } from '../services/solverMapper';

const id = (hex: string) => new mongoose.Types.ObjectId(hex.padStart(24, '0'));

const userA = id('a1');
const userB = id('a2');
const defMorning = id('b1');
const defEvening = id('b2');
const shiftMorning = id('c1');
const shiftMorningParallel = id('c2');
const shiftEvening = id('c3');
const sunday = new Date(2026, 4, 10, 0, 0, 0, 0);
const monday = new Date(2026, 4, 11, 0, 0, 0, 0);

const workers: LeanUser[] = [
  { _id: userA, role: 'employee', isFixedMorningEmployee: false },
  { _id: userB, role: 'employee', isFixedMorningEmployee: false },
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
    _id: defEvening,
    name: 'Evening',
    startTime: '14:45',
    endTime: '22:45',
    durationMinutes: 480,
    crossesMidnight: false,
  },
];

const shifts: LeanShift[] = [
  { _id: shiftMorning, date: sunday, definitionId: defMorning, requiredCount: 1 },
];

function makeAssignmentPreferenceConstraint(
  opts: {
    workerIdStr?: string;
    date?: CalendarDateString;
    definitionIdStr?: string;
  } = {}
): SoftConstraint {
  return {
    id: constraintId('assignment-pref-1'),
    kind: 'soft',
    category: 'assignment_preference',
    weight: weight(25),
    targets: {
      scope: 'all',
      targets: [
        { kind: 'employee', employeeId: workerId(opts.workerIdStr ?? userA.toString()) },
        {
          kind: 'slot',
          date: opts.date ?? ('2026-05-10' as CalendarDateString),
          definitionId: opts.definitionIdStr ?? defMorning.toString(),
        },
      ],
    },
    source: { type: 'employee', actorId: workerId(userA.toString()) },
  };
}

describe('buildPenalties', () => {
  it('emits assignment-targeted penalties for assignment_preference constraints', () => {
    const out = buildPenalties([makeAssignmentPreferenceConstraint()], {
      workers,
      shifts,
      shiftDefinitions,
    });

    expect(out).toEqual([
      {
        worker_id: userA.toString(),
        shift_id: shiftMorning.toString(),
        category: 'assignment_preference',
        weight: 25,
      },
    ]);
  });

  it('emits penalties for every employee target in an assignment_preference constraint', () => {
    const out = buildPenalties(
      [
        {
          ...makeAssignmentPreferenceConstraint(),
          targets: {
            scope: 'all',
            targets: [
              { kind: 'employee', employeeId: workerId(userA.toString()) },
              { kind: 'employee', employeeId: workerId(userB.toString()) },
              {
                kind: 'slot',
                date: '2026-05-10' as CalendarDateString,
                definitionId: defMorning.toString(),
              },
            ],
          },
        },
      ],
      { workers, shifts, shiftDefinitions }
    );

    expect(out).toEqual([
      {
        worker_id: userA.toString(),
        shift_id: shiftMorning.toString(),
        category: 'assignment_preference',
        weight: 25,
      },
      {
        worker_id: userB.toString(),
        shift_id: shiftMorning.toString(),
        category: 'assignment_preference',
        weight: 25,
      },
    ]);
  });

  it('emits penalties for every resolved slot target in an assignment_preference constraint', () => {
    const out = buildPenalties(
      [
        {
          ...makeAssignmentPreferenceConstraint(),
          targets: {
            scope: 'all',
            targets: [
              { kind: 'employee', employeeId: workerId(userA.toString()) },
              {
                kind: 'slot',
                date: '2026-05-10' as CalendarDateString,
                definitionId: defMorning.toString(),
              },
              {
                kind: 'slot',
                date: '2026-05-11' as CalendarDateString,
                definitionId: defEvening.toString(),
              },
            ],
          },
        },
      ],
      {
        workers,
        shifts: [
          ...shifts,
          { _id: shiftEvening, date: monday, definitionId: defEvening, requiredCount: 1 },
        ],
        shiftDefinitions,
      }
    );

    expect(out).toEqual([
      {
        worker_id: userA.toString(),
        shift_id: shiftMorning.toString(),
        category: 'assignment_preference',
        weight: 25,
      },
      {
        worker_id: userA.toString(),
        shift_id: shiftEvening.toString(),
        category: 'assignment_preference',
        weight: 25,
      },
    ]);
  });

  it('emits employee × slot penalties for every resolved assignment pair', () => {
    const out = buildPenalties(
      [
        {
          ...makeAssignmentPreferenceConstraint(),
          targets: {
            scope: 'all',
            targets: [
              { kind: 'employee', employeeId: workerId(userA.toString()) },
              { kind: 'employee', employeeId: workerId(userB.toString()) },
              {
                kind: 'slot',
                date: '2026-05-10' as CalendarDateString,
                definitionId: defMorning.toString(),
              },
              {
                kind: 'slot',
                date: '2026-05-11' as CalendarDateString,
                definitionId: defEvening.toString(),
              },
            ],
          },
        },
      ],
      {
        workers,
        shifts: [
          ...shifts,
          { _id: shiftEvening, date: monday, definitionId: defEvening, requiredCount: 1 },
        ],
        shiftDefinitions,
      }
    );

    expect(out).toHaveLength(4);
    expect(out).toEqual([
      {
        worker_id: userA.toString(),
        shift_id: shiftMorning.toString(),
        category: 'assignment_preference',
        weight: 25,
      },
      {
        worker_id: userA.toString(),
        shift_id: shiftEvening.toString(),
        category: 'assignment_preference',
        weight: 25,
      },
      {
        worker_id: userB.toString(),
        shift_id: shiftMorning.toString(),
        category: 'assignment_preference',
        weight: 25,
      },
      {
        worker_id: userB.toString(),
        shift_id: shiftEvening.toString(),
        category: 'assignment_preference',
        weight: 25,
      },
    ]);
  });

  it('emits multiple penalties when a slot target resolves to parallel shift instances', () => {
    const out = buildPenalties([makeAssignmentPreferenceConstraint()], {
      workers,
      shifts: [
        ...shifts,
        { _id: shiftMorningParallel, date: sunday, definitionId: defMorning, requiredCount: 1 },
      ],
      shiftDefinitions,
    });

    expect(out).toEqual([
      {
        worker_id: userA.toString(),
        shift_id: shiftMorning.toString(),
        category: 'assignment_preference',
        weight: 25,
      },
      {
        worker_id: userA.toString(),
        shift_id: shiftMorningParallel.toString(),
        category: 'assignment_preference',
        weight: 25,
      },
    ]);
  });

  it('returns [] when an assignment_preference constraint does not resolve to a known worker', () => {
    const ghostUser = id('ff');
    const out = buildPenalties(
      [makeAssignmentPreferenceConstraint({ workerIdStr: ghostUser.toString() })],
      { workers, shifts, shiftDefinitions }
    );

    expect(out).toEqual([]);
  });

  it('throws on unsupported soft categories', () => {
    const unsupported: Constraint = {
      id: constraintId('shift-balance-1'),
      kind: 'soft',
      category: 'shift_balance',
      weight: weight(100),
      targets: {
        scope: 'all',
        targets: [{ kind: 'employee', employeeId: workerId(userA.toString()) }],
      },
      source: { type: 'system' },
    };

    expect(() => buildPenalties([unsupported], { workers, shifts, shiftDefinitions })).toThrow(
      /shift_balance.*not yet emitted/
    );
  });
});
