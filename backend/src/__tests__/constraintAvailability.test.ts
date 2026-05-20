import { deriveAvailabilityType, TIME_REGEX } from '../utils/constraintAvailability';

describe('deriveAvailabilityType', () => {
  it('derives "available" when canWork is true and no availabilityType', () => {
    expect(deriveAvailabilityType({ canWork: true })).toBe('available');
  });

  it('derives "unavailable" when canWork is false and no availabilityType', () => {
    expect(deriveAvailabilityType({ canWork: false })).toBe('unavailable');
  });

  it('returns the explicit availabilityType when present, ignoring canWork', () => {
    expect(deriveAvailabilityType({ canWork: false, availabilityType: 'available' })).toBe(
      'available'
    );
    expect(deriveAvailabilityType({ canWork: true, availabilityType: 'unavailable' })).toBe(
      'unavailable'
    );
  });

  it('passes through "partial" regardless of canWork', () => {
    expect(deriveAvailabilityType({ canWork: true, availabilityType: 'partial' })).toBe('partial');
    expect(deriveAvailabilityType({ canWork: false, availabilityType: 'partial' })).toBe('partial');
  });
});

describe('TIME_REGEX', () => {
  it('accepts valid HH:mm values', () => {
    expect(TIME_REGEX.test('00:00')).toBe(true);
    expect(TIME_REGEX.test('09:05')).toBe(true);
    expect(TIME_REGEX.test('23:59')).toBe(true);
  });

  it('rejects invalid time values', () => {
    expect(TIME_REGEX.test('25:00')).toBe(false);
    expect(TIME_REGEX.test('9:5')).toBe(false);
    expect(TIME_REGEX.test('24:00')).toBe(false);
    expect(TIME_REGEX.test('12:60')).toBe(false);
    expect(TIME_REGEX.test('ab:cd')).toBe(false);
  });
});
