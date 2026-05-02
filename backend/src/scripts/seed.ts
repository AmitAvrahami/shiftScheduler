import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import User from '../models/User';
import ShiftDefinition from '../models/ShiftDefinition';

const seedDefinitions = [
  {
    name: 'בוקר',
    startTime: '06:45',
    endTime: '14:45',
    durationMinutes: 480,
    crossesMidnight: false,
    color: '#FFD700',
    isActive: true,
    orderNumber: 1,
    coverageRequirements: { weekday: 2, weekend: 1 },
  },
  {
    name: 'אחהצ',
    startTime: '14:45',
    endTime: '22:45',
    durationMinutes: 480,
    crossesMidnight: false,
    color: '#FFA500',
    isActive: true,
    orderNumber: 2,
    coverageRequirements: { weekday: 2, weekend: 1 },
  },
  {
    name: 'לילה',
    startTime: '22:45',
    endTime: '06:45',
    durationMinutes: 480,
    crossesMidnight: true,
    color: '#000080',
    isActive: true,
    orderNumber: 3,
    coverageRequirements: { weekday: 1, weekend: 1 },
  },
];

const seedUsers = [
  {
    name: 'Meital',
    email: 'meital@shiftscheduler.com',
    password: 'Password123!',
    role: 'manager' as const,
  },
  {
    name: 'Amit',
    email: 'amit@shiftscheduler.com',
    password: 'Password123!',
    role: 'employee' as const,
  },
  {
    name: 'Ofek',
    email: 'ofek@shiftscheduler.com',
    password: 'Password123!',
    role: 'employee' as const,
  },
  {
    name: 'Polina',
    email: 'polina@shiftscheduler.com',
    password: 'Password123!',
    role: 'employee' as const,
  },
  {
    name: 'Shahar',
    email: 'shahar@shiftscheduler.com',
    password: 'Password123!',
    role: 'employee' as const,
  },
  {
    name: 'Bar',
    email: 'bar@shiftscheduler.com',
    password: 'Password123!',
    role: 'employee' as const,
  },
  {
    name: 'Laura',
    email: 'laura@shiftscheduler.com',
    password: 'Password123!',
    role: 'employee' as const,
  },
];

async function seed(): Promise<void> {
  try {
    await connectDB();

    // Clear existing users to ensure exactly 7 users as per requirements
    await User.deleteMany({});
    console.log('Cleared existing users');

    for (const userData of seedUsers) {
      const user = new User(userData);
      await user.save(); // triggers pre-save bcrypt hook
      console.log(`Created ${userData.role}: ${userData.email}`);
    }

    const manager = await User.findOne({ role: 'manager' });
    const existingDefs = await ShiftDefinition.countDocuments();
    if (existingDefs === 0 && manager) {
      for (const d of seedDefinitions) {
        await ShiftDefinition.create({ ...d, createdBy: manager._id });
        console.log(`Created ShiftDefinition: ${d.name}`);
      }
    } else {
      console.log('ShiftDefinitions already exist, skipping.');
    }

    console.log('Seed completed successfully.');
  } catch (err: unknown) {
    console.error('Seed failed:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seed();
