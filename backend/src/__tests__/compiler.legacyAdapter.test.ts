import mongoose from 'mongoose';
import { toLegacyAvailability } from '../services/compiler/legacySolverAdapter';
import type { LeanConstraint } from '../services/solverMapper';

const id = (hex: string) => new mongoose.Types.ObjectId(hex.padStart(24, '0'));

const userA = id('a1');
const userB = id('a2');
const defMorning = id('b1');
const defNight = id('b2');

const sunday = new Date(2026, 4, 10, 0, 0, 0, 0);
const monday = new Date(2026, 4, 11, 0, 0, 0, 0);

describe('toLegacyAvailability', () => {
  it('returns an empty map when there are no constraint documents', () => {
    const map = toLegacyAvailability([], []);
    expect(map.size).toBe(0);
  });

  it('omits the worker key when they have no Mongo Constraint document', () => {
    const map = toLegacyAvailability([], []);
    expect(map.get(userA.toString())).toBeUndefined();
  });

  it('emits one availability entry per IConstraintEntry, including canWork=true rows', () => {
    const constraints: LeanConstraint[] = [
      {
        userId: userA,
        entries: [
          { date: sunday, definitionId: defMorning, canWork: false },
          { date: monday, definitionId: defNight, canWork: true },
        ],
      },
    ];
    const map = toLegacyAvailability([], constraints);
    const entries = map.get(userA.toString());
    expect(entries).toEqual([
      { date: '2026-05-10', definition_id: defMorning.toString(), can_work: false },
      { date: '2026-05-11', definition_id: defNight.toString(), can_work: true },
    ]);
  });

  it('uses local-time date keys (matches toSolveRequest semantics)', () => {
    const constraints: LeanConstraint[] = [
      {
        userId: userA,
        entries: [{ date: sunday, definitionId: defMorning, canWork: false }],
      },
    ];
    const map = toLegacyAvailability([], constraints);
    expect(map.get(userA.toString())![0].date).toBe('2026-05-10');
  });

  it('keys workers separately', () => {
    const constraints: LeanConstraint[] = [
      {
        userId: userA,
        entries: [{ date: sunday, definitionId: defMorning, canWork: false }],
      },
      {
        userId: userB,
        entries: [{ date: monday, definitionId: defNight, canWork: true }],
      },
    ];
    const map = toLegacyAvailability([], constraints);
    expect(map.size).toBe(2);
    expect(map.get(userA.toString())![0].can_work).toBe(false);
    expect(map.get(userB.toString())![0].can_work).toBe(true);
  });
});
