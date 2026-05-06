import mongoose from 'mongoose';
import ShiftDefinition from '../../models/ShiftDefinition';

export async function seedDefaultShiftDefinitions(createdBy: mongoose.Types.ObjectId) {
  const [morning, afternoon, night] = await ShiftDefinition.insertMany([
    {
      name: 'morning',
      startTime: '06:45',
      endTime: '14:45',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#FFD700',
      isActive: true,
      orderNumber: 1,
      createdBy,
      requiredStaffCount: 2,
    },
    {
      name: 'afternoon',
      startTime: '14:45',
      endTime: '22:45',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      durationMinutes: 480,
      crossesMidnight: false,
      color: '#FFA500',
      isActive: true,
      orderNumber: 2,
      createdBy,
      requiredStaffCount: 2,
    },
    {
      name: 'night',
      startTime: '22:45',
      endTime: '06:45',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      durationMinutes: 480,
      crossesMidnight: true,
      color: '#000080',
      isActive: true,
      orderNumber: 3,
      createdBy,
      requiredStaffCount: 1,
    },
  ]);

  return { morning, afternoon, night };
}
