import mongoose from 'mongoose';
import { normalizeLegacyConstraints } from '../services/compiler/constraintNormalizer';
import type { LeanConstraint } from '../services/solverMapper';
import { isHardConstraint } from '../types/constraint';

const id = (hex: string) => new mongoose.Types.ObjectId(hex.padStart(24, '0'));

const userA = id('a1');
const userB = id('a2');
const defMorning = id('b1');
const defNight = id('b2');

const sunday = new Date(2026, 4, 10, 0, 0, 0, 0); // 2026-05-10 local
const monday = new Date(2026, 4, 11, 0, 0, 0, 0); // 2026-05-11 local

describe('normalizeLegacyConstraints', () => {
  it('returns [] for an empty list', () => {
    expect(normalizeLegacyConstraints([], '2026-W20')).toEqual([]);
  });

  it('skips canWork=true entries (they carry no rule)', () => {
    const input: LeanConstraint[] = [
      {
        userId: userA,
        entries: [{ date: sunday, definitionId: defMorning, canWork: true }],
      },
    ];
    expect(normalizeLegacyConstraints(input, '2026-W20')).toEqual([]);
  });

  it('emits one hard availability constraint per canWork=false entry', () => {
    const input: LeanConstraint[] = [
      {
        userId: userA,
        entries: [
          { date: sunday, definitionId: defMorning, canWork: false },
          { date: monday, definitionId: defNight, canWork: true },
          { date: monday, definitionId: defMorning, canWork: false },
        ],
      },
    ];

    const result = normalizeLegacyConstraints(input, '2026-W20');
    expect(result).toHaveLength(2);
    expect(result.every(isHardConstraint)).toBe(true);
    expect(result.every((c) => c.kind === 'hard' && c.category === 'availability')).toBe(true);
  });

  it('builds a stable id of `${userId}:${weekId}:${dateKey}:${definitionId}`', () => {
    const input: LeanConstraint[] = [
      {
        userId: userA,
        entries: [{ date: sunday, definitionId: defMorning, canWork: false }],
      },
    ];
    const [c] = normalizeLegacyConstraints(input, '2026-W20');
    expect(c.id).toBe(`${userA.toString()}:2026-W20:2026-05-10:${defMorning.toString()}`);
  });

  it('records employee + slot targets with scope=all', () => {
    const input: LeanConstraint[] = [
      {
        userId: userA,
        entries: [{ date: sunday, definitionId: defMorning, canWork: false }],
      },
    ];
    const [c] = normalizeLegacyConstraints(input, '2026-W20');
    expect(c.targets.scope).toBe('all');
    expect(c.targets.targets).toHaveLength(2);
    expect(c.targets.targets).toContainEqual({
      kind: 'employee',
      employeeId: userA.toString(),
    });
    expect(c.targets.targets).toContainEqual({
      kind: 'slot',
      date: '2026-05-10',
      definitionId: defMorning.toString(),
    });
  });

  it('records source as employee with the worker id as actor', () => {
    const input: LeanConstraint[] = [
      {
        userId: userA,
        entries: [{ date: sunday, definitionId: defMorning, canWork: false }],
      },
    ];
    const [c] = normalizeLegacyConstraints(input, '2026-W20');
    expect(c.source).toEqual({
      type: 'employee',
      actorId: userA.toString(),
    });
  });

  it('handles multiple workers independently', () => {
    const input: LeanConstraint[] = [
      {
        userId: userA,
        entries: [{ date: sunday, definitionId: defMorning, canWork: false }],
      },
      {
        userId: userB,
        entries: [{ date: monday, definitionId: defNight, canWork: false }],
      },
    ];
    const result = normalizeLegacyConstraints(input, '2026-W20');
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.source.actorId)).toEqual([userA.toString(), userB.toString()]);
  });

  it('uses local-time date keys (not UTC)', () => {
    // Local midnight on 2026-05-10 IST → UTC date would be 2026-05-09
    const input: LeanConstraint[] = [
      {
        userId: userA,
        entries: [{ date: sunday, definitionId: defMorning, canWork: false }],
      },
    ];
    const [c] = normalizeLegacyConstraints(input, '2026-W20');
    const slot = c.targets.targets.find((t) => t.kind === 'slot')!;
    expect(slot).toMatchObject({ kind: 'slot', date: '2026-05-10' });
  });
});
