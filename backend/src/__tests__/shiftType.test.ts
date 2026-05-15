import { classifyShiftType } from '../utils/shiftType';

describe('classifyShiftType', () => {
  it('classifies a midnight-crossing shift as night regardless of start hour', () => {
    expect(classifyShiftType({ startTime: '22:45', crossesMidnight: true })).toBe('night');
    expect(classifyShiftType({ startTime: '00:30', crossesMidnight: true })).toBe('night');
  });

  it('classifies a non-crossing shift starting before 12:00 as morning', () => {
    expect(classifyShiftType({ startTime: '06:45', crossesMidnight: false })).toBe('morning');
    expect(classifyShiftType({ startTime: '00:00', crossesMidnight: false })).toBe('morning');
    expect(classifyShiftType({ startTime: '11:59', crossesMidnight: false })).toBe('morning');
  });

  it('classifies a non-crossing shift starting at/after 12:00 as afternoon', () => {
    expect(classifyShiftType({ startTime: '12:00', crossesMidnight: false })).toBe('afternoon');
    expect(classifyShiftType({ startTime: '14:45', crossesMidnight: false })).toBe('afternoon');
  });

  it('is language-independent — Hebrew production names classify correctly', () => {
    // בוקר 06:45, צהריים 14:45, לילה 22:45 (crosses midnight)
    expect(classifyShiftType({ startTime: '06:45', crossesMidnight: false })).toBe('morning');
    expect(classifyShiftType({ startTime: '14:45', crossesMidnight: false })).toBe('afternoon');
    expect(classifyShiftType({ startTime: '22:45', crossesMidnight: true })).toBe('night');
  });
});
