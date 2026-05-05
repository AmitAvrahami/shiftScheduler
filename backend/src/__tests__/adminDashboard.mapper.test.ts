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
      }),
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
      }),
    );
  });

  it('maps shifts, assignments, missing constraints, kpis, readiness, and audit logs', () => {
    const dto = toAdminDashboardDTO(makeRaw());

    expect(dto.employees).toHaveLength(2);
    expect(dto.shifts).toEqual([
      {
        id: shiftId.toString(),
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
});
