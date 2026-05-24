import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import Schedule from '../models/WeeklySchedule';

export interface CleanupPublishedSchedulesResult {
  found: number;
  deleted: number;
  remaining: number;
}

const publishedScheduleFilter = { status: 'published' as const };

export async function cleanupPublishedSchedules(): Promise<CleanupPublishedSchedulesResult> {
  const found = await Schedule.countDocuments(publishedScheduleFilter);
  console.log(`Found ${found} published schedules`);

  const deleteResult = await Schedule.deleteMany(publishedScheduleFilter);
  const deleted = deleteResult.deletedCount ?? 0;
  console.log(`Deleted ${deleted} published schedules`);

  const remaining = await Schedule.countDocuments(publishedScheduleFilter);
  if (remaining !== 0) {
    throw new Error(`Cleanup verification failed: ${remaining} published schedules remain`);
  }

  return { found, deleted, remaining };
}

async function main(): Promise<void> {
  await connectDB();
  try {
    await cleanupPublishedSchedules();
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(
      'Published schedule cleanup failed:',
      err instanceof Error ? err.message : String(err)
    );
    process.exitCode = 1;
  });
}
