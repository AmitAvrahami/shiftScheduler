import {
  PARTIAL_MIN_OVERLAP_MINUTES,
  calculateOverlapMinutes,
  classifyAvailabilityAgainstShift,
  normalizeTimeRange,
  parseTimeToMinutes,
} from '../services/compiler/availabilityClassifier';

const morningShift = {
  startTime: '08:00',
  endTime: '16:00',
  durationMinutes: 480,
  crossesMidnight: false,
};

const nightShift = {
  startTime: '22:45',
  endTime: '06:45',
  durationMinutes: 480,
  crossesMidnight: true,
};

describe('parseTimeToMinutes', () => {
  it('parses valid HH:MM into minutes since midnight', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('08:00')).toBe(480);
    expect(parseTimeToMinutes('22:45')).toBe(22 * 60 + 45);
    expect(parseTimeToMinutes('23:59')).toBe(23 * 60 + 59);
  });

  it('throws on malformed input', () => {
    expect(() => parseTimeToMinutes('25:00')).toThrow(RangeError);
    expect(() => parseTimeToMinutes('9:5')).toThrow(RangeError);
    expect(() => parseTimeToMinutes('abc')).toThrow(RangeError);
  });
});

describe('normalizeTimeRange', () => {
  it('keeps same-day ranges on a single day axis', () => {
    expect(normalizeTimeRange('09:00', '17:00')).toEqual({
      startMin: 540,
      endMin: 1020,
      crossesMidnight: false,
    });
  });

  it('shifts the end past midnight when crossing', () => {
    const range = normalizeTimeRange('22:45', '06:45');
    expect(range.startMin).toBe(22 * 60 + 45);
    expect(range.endMin).toBe(range.startMin + 480);
    expect(range.crossesMidnight).toBe(true);
  });

  it('treats equal times as a full 24-hour window', () => {
    const range = normalizeTimeRange('08:00', '08:00');
    expect(range.endMin - range.startMin).toBe(1440);
  });
});

describe('calculateOverlapMinutes', () => {
  it('returns the length when availability is contained in shift', () => {
    // shift 480..960, availability 540..900 → 360
    expect(calculateOverlapMinutes(540, 900, 480, 960)).toBe(360);
  });

  it('returns 0 for disjoint intervals', () => {
    expect(calculateOverlapMinutes(0, 100, 200, 300)).toBe(0);
  });

  it('returns exact partial overlap', () => {
    // shift 480..960 (8h), availability 600..1100 → 360 (10:00-16:00)
    expect(calculateOverlapMinutes(600, 1100, 480, 960)).toBe(360);
  });
});

describe('classifyAvailabilityAgainstShift', () => {
  it('classifies canWork=false as forbidden', () => {
    expect(classifyAvailabilityAgainstShift({ canWork: false }, morningShift)).toBe('forbidden');
  });

  it('classifies plain canWork=true as available', () => {
    expect(classifyAvailabilityAgainstShift({ canWork: true }, morningShift)).toBe('available');
  });

  it("classifies explicit availabilityType='unavailable' as forbidden", () => {
    expect(
      classifyAvailabilityAgainstShift(
        { canWork: true, availabilityType: 'unavailable' },
        morningShift
      )
    ).toBe('forbidden');
  });

  it('classifies a partial window that covers the full shift as available', () => {
    expect(
      classifyAvailabilityAgainstShift(
        {
          canWork: true,
          availabilityType: 'partial',
          startTime: '06:00',
          endTime: '18:00',
        },
        morningShift
      )
    ).toBe('available');
  });

  it('classifies a partial window with exactly 360 min overlap as partial_warning', () => {
    // availability 10:00-16:00 vs shift 08:00-16:00 → 360 min overlap, shift is 480 min
    expect(
      classifyAvailabilityAgainstShift(
        {
          canWork: true,
          availabilityType: 'partial',
          startTime: '10:00',
          endTime: '16:00',
        },
        morningShift
      )
    ).toBe('partial_warning');
  });

  it('classifies a partial window with <360 min overlap as forbidden', () => {
    // availability 11:00-16:00 vs shift 08:00-16:00 → 300 min overlap
    expect(
      classifyAvailabilityAgainstShift(
        {
          canWork: true,
          availabilityType: 'partial',
          startTime: '11:00',
          endTime: '16:00',
        },
        morningShift
      )
    ).toBe('forbidden');
  });

  it('classifies a partial window with zero overlap as forbidden', () => {
    expect(
      classifyAvailabilityAgainstShift(
        {
          canWork: true,
          availabilityType: 'partial',
          startTime: '18:00',
          endTime: '22:00',
        },
        morningShift
      )
    ).toBe('forbidden');
  });

  it('respects PARTIAL_MIN_OVERLAP_MINUTES = 360', () => {
    expect(PARTIAL_MIN_OVERLAP_MINUTES).toBe(360);
  });

  describe('overnight shift 22:45-06:45', () => {
    it('treats early-morning availability that overlaps ≥360 min as partial_warning', () => {
      // shift starts 22:45, ends 06:45 next day (480 min).
      // availability 00:00-06:45 = 405 min overlap.
      expect(
        classifyAvailabilityAgainstShift(
          {
            canWork: true,
            availabilityType: 'partial',
            startTime: '00:00',
            endTime: '06:45',
          },
          nightShift
        )
      ).toBe('partial_warning');
    });

    it('treats availability covering the whole shift as available', () => {
      expect(
        classifyAvailabilityAgainstShift(
          {
            canWork: true,
            availabilityType: 'partial',
            startTime: '22:00',
            endTime: '07:00',
          },
          nightShift
        )
      ).toBe('available');
    });

    it('treats availability that overlaps <360 min as forbidden', () => {
      // 04:00-06:45 = 165 min overlap with 22:45-06:45
      expect(
        classifyAvailabilityAgainstShift(
          {
            canWork: true,
            availabilityType: 'partial',
            startTime: '04:00',
            endTime: '06:45',
          },
          nightShift
        )
      ).toBe('forbidden');
    });

    it('treats disjoint daytime availability as forbidden', () => {
      expect(
        classifyAvailabilityAgainstShift(
          {
            canWork: true,
            availabilityType: 'partial',
            startTime: '08:00',
            endTime: '14:00',
          },
          nightShift
        )
      ).toBe('forbidden');
    });
  });

  it('falls back to available when partial is missing startTime/endTime', () => {
    expect(
      classifyAvailabilityAgainstShift({ canWork: true, availabilityType: 'partial' }, morningShift)
    ).toBe('available');
  });
});
