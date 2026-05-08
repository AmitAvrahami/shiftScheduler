import { useEffect, useState } from 'react';
import type { AdminDashboardDTO } from '../types';
import { ShiftCard, type ShiftDef, type StaffEntry } from './ShiftCard';
import { normalizeShiftDay, WEEK_DAYS_ORDER } from '../utils/scheduleBoardUtils';
import { getCurrentWeekId, getNowInIsraelParts } from '../../../utils/weekUtils';

type DashboardShift = AdminDashboardDTO['shifts'][number];
type DashboardAssignment = AdminDashboardDTO['assignments'][number];
type DashboardEmployee = AdminDashboardDTO['employees'][number];

// UI display config only — labels, colors, icons, display times.
// Shift counts, assignments, and required employees come from dashboard.shifts.
// TODO: future dynamic shift definitions should come from the ShiftDefinition API;
//       remove this static list when the backend exposes shift metadata per week.
const SHIFTS: ShiftDef[] = [
  {
    id: 'morning',
    label: 'בוקר',
    start: '06:45',
    end: '14:45',
    color: '#f59e0b',
    dimBg: 'rgba(245,158,11,0.15)',
    icon: 'wb_sunny',
  },
  {
    id: 'afternoon',
    label: 'אחה"צ',
    start: '14:45',
    end: '22:45',
    color: '#8b5cf6',
    dimBg: 'rgba(139,92,246,0.15)',
    icon: 'light_mode',
  },
  {
    id: 'night',
    label: 'לילה',
    start: '22:45',
    end: '06:45',
    color: '#06b6d4',
    dimBg: 'rgba(6,182,212,0.15)',
    icon: 'dark_mode',
  },
];

function getCurrentShiftIndex(parts: { hour: number; minute: number }): number {
  const mins = parts.hour * 60 + parts.minute;
  if (mins >= 6 * 60 + 45 && mins < 14 * 60 + 45) return 0;
  if (mins >= 14 * 60 + 45 && mins < 22 * 60 + 45) return 1;
  return 2;
}

export function ShiftOverviewPanel({
  weekId,
  employees,
  shifts,
  assignments,
}: {
  weekId: string;
  employees: DashboardEmployee[];
  shifts: DashboardShift[];
  assignments: DashboardAssignment[];
}) {
  const [nowParts, setNowParts] = useState(() => getNowInIsraelParts());

  useEffect(() => {
    const t = setInterval(() => setNowParts(getNowInIsraelParts()), 60_000);
    return () => clearInterval(t);
  }, []);

  const isCurrentWeek = weekId === getCurrentWeekId();

  if (!isCurrentWeek) {
    return (
      <section className="flex flex-col gap-md">
        <h2 className="text-xl font-bold text-[#010636] border-r-4 border-[#056AE5] pr-3">
          סטטוס משמרות
        </h2>
        <p className="text-sm text-gray-500">תצוגת שבוע — לא השבוע הנוכחי</p>
      </section>
    );
  }

  const curIdx = getCurrentShiftIndex(nowParts);
  const prevIdx = (curIdx + 2) % 3;
  const nextIdx = (curIdx + 1) % 3;

  const todayDay = WEEK_DAYS_ORDER[nowParts.day];

  function getShiftData(defIdx: number) {
    const shiftDef = SHIFTS[defIdx];
    if (!shiftDef) return { staff: [], requiredCount: 0, shift: undefined };

    const todayShift = shifts.find((s) => {
      return normalizeShiftDay(s.day) === todayDay && s.type === shiftDef.id;
    });

    if (!todayShift) return { staff: [], requiredCount: 0, shift: undefined };

    const shiftAssignments = assignments.filter((a) => a.shiftId === todayShift.id);
    const staff: StaffEntry[] = shiftAssignments.map((a) => {
      const user = employees.find((u) => u.id === a.employeeId);
      return {
        id: a.id,
        name: user?.name ?? 'עובד לא ידוע',
        isFixed: user?.isFixedMorningEmployee ?? false,
      };
    });

    return { staff, requiredCount: todayShift.requiredEmployees, shift: todayShift };
  }

  const prevData = getShiftData(prevIdx);
  const curData = getShiftData(curIdx);
  const nextData = getShiftData(nextIdx);

  return (
    <section className="flex flex-col gap-md">
      <h2 className="text-xl font-bold text-[#010636] border-r-4 border-[#056AE5] pr-3">
        סטטוס משמרות
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
        <ShiftCard
          shift={SHIFTS[prevIdx]}
          instance={prevData.shift}
          staff={prevData.staff}
          requiredCount={prevData.requiredCount}
          type="prev"
        />
        <ShiftCard
          shift={SHIFTS[curIdx]}
          instance={curData.shift}
          staff={curData.staff}
          requiredCount={curData.requiredCount}
          type="current"
        />
        <ShiftCard
          shift={SHIFTS[nextIdx]}
          instance={nextData.shift}
          staff={nextData.staff}
          requiredCount={nextData.requiredCount}
          type="next"
        />
      </div>
    </section>
  );
}
