import { getWeekLabelParts } from '../utils/weekUtils';

/**
 * Canonical week label: "שבוע {N} · {DD/MM/YYYY}–{DD/MM/YYYY}".
 * The numeric date range is isolated with dir="ltr" so it renders left-to-right
 * (start before end) inside the surrounding RTL Hebrew text.
 */
export function WeekLabel({ weekId }: { weekId: string }) {
  const { weekNumber, dateRange } = getWeekLabelParts(weekId);
  return (
    <>
      שבוע {weekNumber} · <span dir="ltr">{dateRange}</span>
    </>
  );
}
