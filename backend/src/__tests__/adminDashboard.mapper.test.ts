import mongoose from 'mongoose';
import { toAdminDashboardDTO } from '../modules/adminDashboard/adminDashboard.mapper';
import type { AdminDashboardRaw } from '../modules/adminDashboard/adminDashboard.dto';

const id = (hex: string) => new mongoose.Types.ObjectId(hex.padStart(24, '0'));

const scheduleId = id('1');
const employeeId = id('2');
const managerId = id('3');
const definitionId = id('4');
const shiftId = id('5');
const assignmentId = id('6');
const auditLogId = id('7');

function makeRaw(overrides: Partial<AdminDashboardRaw> = {}): AdminDashboardRaw {
  return {
    weekId: '2026-W20',
    schedule: {
      _id: scheduleId,
      weekId: '2026-W20',
      status: 'draft',
      startDate: new Date(2026, 4, 10),
      endDate: new Date(2026, 4, 16),
    },
    employees: [
      {
        _id: employeeId,
        name: 'Worker One',
        role: 'employee',
        isActive: true,
      },
      {
        _id: managerId,
        name: 'Manager One',
        role: 'manager',
        isActive: true,
        isFixedMorningEmployee: true,
      },
    ],
    shiftDefinitions: [
      {
        _id: definitionId,
        name: 'Morning',
        startTime: '06:45',
      },
    ],
    shifts: [
      {
        _id: shiftId,
        scheduleId,
        definitionId,
        date: new Date(2026, 4, 10),
        startTime: '06:45',
        requiredCount: 2,
        status: 'partial',
      },
    ],
    assignments: [
      {
        _id: assignmentId,
        shiftId,
        userId: employeeId,
        scheduleId,
      },
    ],
    constraintUserIds: [employeeId.toString()],
    auditLogs: [
      {
        _id: auditLogId,
        action: 'schedule.generated',
        createdAt: new Date(2026, 4, 10, 12, 0),
      },
    ],
    ...overrides,
  };
}

describe('toAdminDashboardDTO', () => {
  it('returns scheduleId from raw.schedule._id when a schedule exists', () => {
    const dto = toAdminDashboardDTO(makeRaw());

    expect(dto.weekId).toBe('2026-W20');
    expect(dto.scheduleId).toBe(scheduleId.toString());
    expect(dto.scheduleStatus).toBe('draft');
  });

  it('returns null scheduleId and not_created status when no schedule exists', () => {
    const dto = toAdminDashboardDTO(
      makeRaw({
        schedule: null,
        shifts: [],
        assignments: [],
        auditLogs: [],
      })
    );

    expect(dto.scheduleId).toBeNull();
    expect(dto.scheduleStatus).toBe('not_created');
  });

  it('includes the stable frontend contract fields', () => {
    const dto = toAdminDashboardDTO(makeRaw());

    expect(dto).toEqual(
      expect.objectContaining({
        weekId: expect.any(String),
        scheduleId: expect.any(String),
        scheduleStatus: expect.any(String),
        employees: expect.any(Array),
        shifts: expect.any(Array),
        assignments: expect.any(Array),
        missingConstraints: expect.any(Array),
        kpis: expect.any(Object),
        readiness: expect.any(Object),
        auditLogs: expect.any(Array),
      })
    );
  });

  it('maps shifts, assignments, missing constraints, kpis, readiness, and audit logs', () => {
    const dto = toAdminDashboardDTO(makeRaw());

    expect(dto.employees).toHaveLength(2);
    expect(dto.shifts).toEqual([
      {
        id: shiftId.toString(),
        definitionId: definitionId.toString(),
        day: '2026-05-10',
        type: 'morning',
        requiredEmployees: 2,
      },
    ]);
    expect(dto.assignments).toEqual([
      {
        id: assignmentId.toString(),
        shiftId: shiftId.toString(),
        employeeId: employeeId.toString(),
      },
    ]);
    expect(dto.missingConstraints).toEqual([]);
    expect(dto.kpis).toEqual({
      totalShifts: 1,
      filledShifts: 0,
      missingAssignments: 1,
      employeesMissingConstraints: 0,
    });
    expect(dto.readiness).toEqual({
      canGenerate: true,
      hasMissingConstraints: false,
      hasNoEmployees: false,
      hasNoShifts: false,
      warnings: [],
    });
    expect(dto.auditLogs).toEqual([
      {
        id: auditLogId.toString(),
        action: 'schedule.generated',
        createdAt: new Date(2026, 4, 10, 12, 0),
      },
    ]);
  });

  it('copies persisted generation warnings/violations and lastGeneratedAt', () => {
    const generatedAt = new Date(2026, 4, 10, 9, 30);
    const generationScore = {
      totalPenalty: 150,
      breakdown: {
        NIGHT_OVERCAP: 100,
        assignment_preference: 50,
      },
      generatedAt,
    };
    const warning = {
      constraint_id: 'ASSIGNMENT_PREFERENCE',
      type: 'ASSIGNMENT_PREFERENCE',
      severity: 'warning' as const,
      worker_id: employeeId.toString(),
      shift_ids: [shiftId.toString()],
      message: 'Worker assigned to a penalised shift.',
    };
    const violation = {
      constraint_id: 'MAXIMUM_LOAD',
      shift_id: null,
      worker_id: null,
      message: 'Load constraint relaxed',
    };

    const dto = toAdminDashboardDTO(
      makeRaw({
        schedule: {
          _id: scheduleId,
          weekId: '2026-W20',
          status: 'draft',
          startDate: new Date(2026, 4, 10),
          endDate: new Date(2026, 4, 16),
          generationWarnings: [warning],
          generationViolations: [violation],
          generationScore,
          lastGeneratedAt: generatedAt,
        },
      })
    );

    expect(dto.generationWarnings).toEqual([warning]);
    expect(dto.generationViolations).toEqual([violation]);
    expect(dto.generationScore).toEqual(generationScore);
    expect(dto.lastGeneratedAt).toEqual(generatedAt);
  });

  it('defaults generation fields to empty/null when the schedule has none', () => {
    const dto = toAdminDashboardDTO(makeRaw());

    expect(dto.generationWarnings).toEqual([]);
    expect(dto.generationViolations).toEqual([]);
    expect(dto.generationScore).toBeNull();
    expect(dto.lastGeneratedAt).toBeNull();
  });

  it('defaults generation fields when no schedule exists', () => {
    const dto = toAdminDashboardDTO(
      makeRaw({ schedule: null, shifts: [], assignments: [], auditLogs: [] })
    );

    expect(dto.generationWarnings).toEqual([]);
    expect(dto.generationViolations).toEqual([]);
    expect(dto.generationScore).toBeNull();
    expect(dto.lastGeneratedAt).toBeNull();
  });
});
