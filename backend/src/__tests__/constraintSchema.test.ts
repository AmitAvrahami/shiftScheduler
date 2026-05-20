import { entrySchema, upsertSchema } from '../validation/constraintSchema';

const base = { date: '2026-06-15', definitionId: 'def-1' };

describe('constraint entrySchema', () => {
  it('validates an existing canWork=true entry (no new fields)', () => {
    expect(entrySchema.safeParse({ ...base, canWork: true }).success).toBe(true);
  });

  it('validates an existing canWork=false entry (no new fields)', () => {
    expect(entrySchema.safeParse({ ...base, canWork: false }).success).toBe(true);
  });

  it('accepts a partial entry only when startTime and endTime are present', () => {
    expect(
      entrySchema.safeParse({
        ...base,
        canWork: true,
        availabilityType: 'partial',
        startTime: '09:00',
        endTime: '13:30',
      }).success
    ).toBe(true);

    const missing = entrySchema.safeParse({
      ...base,
      canWork: true,
      availabilityType: 'partial',
    });
    expect(missing.success).toBe(false);

    const missingEnd = entrySchema.safeParse({
      ...base,
      canWork: true,
      availabilityType: 'partial',
      startTime: '09:00',
    });
    expect(missingEnd.success).toBe(false);
  });

  it('rejects invalid time formats', () => {
    expect(
      entrySchema.safeParse({
        ...base,
        canWork: true,
        availabilityType: 'partial',
        startTime: '25:00',
        endTime: '13:00',
      }).success
    ).toBe(false);

    expect(
      entrySchema.safeParse({
        ...base,
        canWork: true,
        availabilityType: 'partial',
        startTime: '09:00',
        endTime: '9:5',
      }).success
    ).toBe(false);
  });

  it('allows times only when not partial without affecting validity', () => {
    expect(
      entrySchema.safeParse({
        ...base,
        canWork: true,
        availabilityType: 'available',
      }).success
    ).toBe(true);
  });

  it('rejects an invalid availabilityType value', () => {
    expect(
      entrySchema.safeParse({ ...base, canWork: true, availabilityType: 'maybe' }).success
    ).toBe(false);
  });

  it('still requires canWork (API contract not widened)', () => {
    expect(entrySchema.safeParse({ ...base }).success).toBe(false);
  });

  it('preserves the existing date-format error message', () => {
    const result = entrySchema.safeParse({
      date: '06-15-2026',
      definitionId: 'def-1',
      canWork: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toBe('Invalid date format');
    }
  });
});

describe('constraint upsertSchema', () => {
  it('accepts an empty entries array (clears constraints)', () => {
    expect(upsertSchema.safeParse({ entries: [] }).success).toBe(true);
  });

  it('accepts a legacy payload with only canWork entries (backward compatible)', () => {
    const result = upsertSchema.safeParse({
      entries: [
        { ...base, canWork: false },
        { date: '2026-06-16', definitionId: 'def-2', canWork: true },
      ],
    });
    expect(result.success).toBe(true);
  });
});
