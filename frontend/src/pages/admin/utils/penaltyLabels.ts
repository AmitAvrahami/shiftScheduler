const PENALTY_CATEGORY_LABELS: Record<string, string> = {
  SHIFT_BALANCE: 'איזון מספר משמרות',
  TYPE_DIVERSITY: 'גיוון סוגי משמרות',
  REST_OPTIMISATION: 'מנוחה בין משמרות',
  WEEKEND_BALANCE: 'איזון סוף שבוע',
  NIGHT_OVERCAP: 'ריבוי משמרות לילה',
  FRI_SAT_CLUSTER: 'שישי ושבת רצופים',
  ASSIGNMENT_PREFERENCE: 'זמינות חלקית / העדפת שיבוץ',
  assignment_preference: 'זמינות חלקית / העדפת שיבוץ',
};

export function getPenaltyCategoryLabel(category: string): string {
  const direct = PENALTY_CATEGORY_LABELS[category];
  if (direct) return direct;

  const upper = category.toUpperCase();
  const normalized = PENALTY_CATEGORY_LABELS[upper];
  if (normalized) return normalized;

  return category.replace(/_/g, ' ');
}

export function getSortedPenaltyBreakdown(
  breakdown: Record<string, number> | undefined
): Array<[string, number]> {
  return Object.entries(breakdown ?? {}).sort(([aKey, aValue], [bKey, bValue]) => {
    if (bValue !== aValue) return bValue - aValue;
    return getPenaltyCategoryLabel(aKey).localeCompare(getPenaltyCategoryLabel(bKey), 'he');
  });
}
