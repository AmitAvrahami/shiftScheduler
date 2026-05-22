import { detectPublishWarnings } from '../../../frontend/src/utils/partialAvailabilityWarnings';
import type { Constraint, ShiftDefinition } from '../../../frontend/src/types/constraint';
import type {
  AdminDashboardAssignment,
  AdminDashboardShift,
  AdminDashboardEmployee,
} from '../../../frontend/src/pages/admin/types';

describe('detectPublishWarnings', () => {
  const mockEmployees: AdminDashboardEmployee[] = [
    { id: 'emp-1', name: 'עמית', role: 'employee', isActive: true },
    { id: 'emp-2', name: 'דני', role: 'employee', isActive: true },
  ];

  const mockShiftDefinitions: ShiftDefinition[] = [
    {
      _id: 'def-morning',
      name: 'בוקר',
      startTime: '08:00',
      endTime: '16:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#blue',
      isActive: true,
      orderNumber: 1,
      requiredStaffCount: 1,
    },
  ];

  const mockShifts: AdminDashboardShift[] = [
    {
      id: 'shift-1',
      day: '2026-05-24',
      type: 'morning',
      requiredEmployees: 1,
      definitionId: 'def-morning',
    },
  ];

  // Happy Path
  it('should detect a warning for assigned partial availability with 6h overlap (partial_warning)', () => {
    const assignments: AdminDashboardAssignment[] = [
      { id: 'a-1', shiftId: 'shift-1', employeeId: 'emp-1' },
    ];

    const constraints: Constraint[] = [
      {
        _id: 'c-1',
        userId: 'emp-1',
        weekId: '2026-W22',
        isLocked: true,
        submittedVia: 'self',
        submittedAt: new Date().toISOString(),
        entries: [
          {
            date: '2026-05-24',
            definitionId: 'def-morning',
            canWork: true,
            availabilityType: 'partial',
            startTime: '08:00',
            endTime: '14:00', // 6 hours overlap => 360 mins => partial_warning
          },
        ],
      },
    ];

    const warnings = detectPublishWarnings(
      assignments,
      mockShifts,
      constraints,
      mockEmployees,
      mockShiftDefinitions
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0].employeeName).toBe('עמית');
    expect(warnings[0].overlapMinutes).toBe(360);
    expect(warnings[0].shiftName).toBe('בוקר');
  });

  // Edge Cases
  it("should NOT warn if partial availability is less than 6h overlap (treated as forbidden and shouldn't be assigned, hence no publish warning)", () => {
    const assignments: AdminDashboardAssignment[] = [
      { id: 'a-1', shiftId: 'shift-1', employeeId: 'emp-1' },
    ];

    const constraints: Constraint[] = [
      {
        _id: 'c-1',
        userId: 'emp-1',
        weekId: '2026-W22',
        isLocked: true,
        submittedVia: 'self',
        submittedAt: new Date().toISOString(),
        entries: [
          {
            date: '2026-05-24',
            definitionId: 'def-morning',
            canWork: true,
            availabilityType: 'partial',
            startTime: '08:00',
            endTime: '13:00', // 5 hours overlap => 300 mins => forbidden
          },
        ],
      },
    ];

    const warnings = detectPublishWarnings(
      assignments,
      mockShifts,
      constraints,
      mockEmployees,
      mockShiftDefinitions
    );

    expect(warnings).toHaveLength(0);
  });

  it('should NOT warn if partial availability covers the entire shift (treated as fully available)', () => {
    const assignments: AdminDashboardAssignment[] = [
      { id: 'a-1', shiftId: 'shift-1', employeeId: 'emp-1' },
    ];

    const constraints: Constraint[] = [
      {
        _id: 'c-1',
        userId: 'emp-1',
        weekId: '2026-W22',
        isLocked: true,
        submittedVia: 'self',
        submittedAt: new Date().toISOString(),
        entries: [
          {
            date: '2026-05-24',
            definitionId: 'def-morning',
            canWork: true,
            availabilityType: 'partial',
            startTime: '08:00',
            endTime: '16:00', // 8 hours overlap => 480 mins => available
          },
        ],
      },
    ];

    const warnings = detectPublishWarnings(
      assignments,
      mockShifts,
      constraints,
      mockEmployees,
      mockShiftDefinitions
    );

    expect(warnings).toHaveLength(0);
  });

  it('should NOT warn if the employee has a partial constraint but is not assigned to the shift', () => {
    const assignments: AdminDashboardAssignment[] = []; // No assignment

    const constraints: Constraint[] = [
      {
        _id: 'c-1',
        userId: 'emp-1',
        weekId: '2026-W22',
        isLocked: true,
        submittedVia: 'self',
        submittedAt: new Date().toISOString(),
        entries: [
          {
            date: '2026-05-24',
            definitionId: 'def-morning',
            canWork: true,
            availabilityType: 'partial',
            startTime: '08:00',
            endTime: '14:00', // partial_warning, but unassigned
          },
        ],
      },
    ];

    const warnings = detectPublishWarnings(
      assignments,
      mockShifts,
      constraints,
      mockEmployees,
      mockShiftDefinitions
    );

    expect(warnings).toHaveLength(0);
  });

  // Error Handling & Empty Inputs
  it('should return empty array for empty inputs', () => {
    const warnings = detectPublishWarnings([], [], [], [], []);
    expect(warnings).toEqual([]);
  });
});
