import { z } from 'zod';
import { TIME_REGEX } from '../utils/constraintAvailability';

export const entrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    definitionId: z.string().min(1),
    canWork: z.boolean(),
    availabilityType: z.enum(['available', 'unavailable', 'partial']).optional(),
    startTime: z.string().regex(TIME_REGEX, 'Invalid time format').optional(),
    endTime: z.string().regex(TIME_REGEX, 'Invalid time format').optional(),
    note: z.string().optional(),
  })
  .superRefine((entry, ctx) => {
    if (entry.availabilityType !== 'partial') {
      return;
    }
    if (!entry.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startTime'],
        message: 'Partial availability requires startTime and endTime',
      });
    }
    if (!entry.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endTime'],
        message: 'Partial availability requires startTime and endTime',
      });
    }
  });

export const upsertSchema = z.object({
  entries: z.array(entrySchema),
});
