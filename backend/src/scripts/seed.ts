import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import User from '../models/User';

const seedUsers = [
  {
    name: 'מנהל מערכת',
    email: 'admin@shiftscheduler.com',
    password: 'Admin1234!',
    role: 'manager' as const,
    isFixedMorningEmployee: true,
  },
  {
    name: 'עובד לדוגמה',
    email: 'employee@shiftscheduler.com',
    password: 'Employee1234!',
    role: 'employee' as const,
  },
  {
    name: 'דניאל כהן',
    email: 'daniel@shiftscheduler.com',
    password: 'Employee1234!',
    role: 'employee' as const,
  },
  {
    name: 'מיה לוי',
    email: 'mia@shiftscheduler.com',
    password: 'Employee1234!',
    role: 'employee' as const,
  },
  {
    name: 'רון שמיר',
    email: 'ron@shiftscheduler.com',
    password: 'Employee1234!',
    role: 'employee' as const,
  },
  {
    name: 'לילך אברהם',
    email: 'lilach@shiftscheduler.com',
    password: 'Employee1234!',
    role: 'employee' as const,
  },
  {
    name: 'אמיר בן-דוד',
    email: 'amir@shiftscheduler.com',
    password: 'Employee1234!',
    role: 'employee' as const,
  },
  {
    name: 'שירה פרץ',
    email: 'shira@shiftscheduler.com',
    password: 'Employee1234!',
    role: 'employee' as const,
  },
  {
    name: 'יוסי גולן',
    email: 'yossi@shiftscheduler.com',
    password: 'Employee1234!',
    role: 'employee' as const,
  },
  {
    name: 'נוי ברק',
    email: 'noy@shiftscheduler.com',
    password: 'Employee1234!',
    role: 'employee' as const,
  },
  {
    name: 'אור זיו',
    email: 'or@shiftscheduler.com',
    password: 'Employee1234!',
    role: 'employee' as const,
  },
];

async function seed(): Promise<void> {
  await connectDB();

  for (const userData of seedUsers) {
    const existing = await User.findOne({ email: userData.email });
    if (existing) {
      // Idempotent promotion: upgrade legacy admin role to manager
      if (existing.role === 'admin') {
        await User.findByIdAndUpdate(existing._id, {
          role: 'manager',
          isFixedMorningEmployee: true,
        });
        console.log(`Promoted admin → manager: ${userData.email}`);
      } else {
        console.log(`User already exists, skipping: ${userData.email}`);
      }
      continue;
    }
    const user = new User(userData);
    await user.save(); // triggers pre-save bcrypt hook
    console.log(`Created ${userData.role}: ${userData.email}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((err: Error) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
