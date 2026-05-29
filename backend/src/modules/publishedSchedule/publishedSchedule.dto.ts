import type { ShiftTypeDTO } from '../adminDashboard/adminDashboard.dto';

export interface PublishedScheduleDTO {
  schedule: {
    id: string;
    weekId: string;
    startDate: Date;
    endDate: Date;
    status: 'published';
    publishedAt?: Date;
  };
  shifts: Array<{
    id: string;
    day: string;
    type: ShiftTypeDTO;
    requiredEmployees: number;
    definitionId: string;
  }>;
  assignments: Array<{
    id: string;
    shiftId: string;
    employeeId: string;
  }>;
  employees: Array<{
    id: string;
    name: string;
  }>;
}
