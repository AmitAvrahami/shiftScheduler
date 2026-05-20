export type AvailabilityType = 'available' | 'unavailable' | 'partial';

export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function deriveAvailabilityType(entry: {
  canWork: boolean;
  availabilityType?: AvailabilityType;
}): AvailabilityType {
  if (entry.availabilityType) {
    return entry.availabilityType;
  }
  if (entry.canWork === false) {
    return 'unavailable';
  }
  return 'available';
}
