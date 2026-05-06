import mongoose from 'mongoose';
import Notification from '../models/Notification';
import User from '../models/User';

export async function broadcastToEmployees(
  title: string,
  body: string,
  type: 'announcement' | 'system_announcement' = 'announcement',
  refId?: mongoose.Types.ObjectId,
  refModel?: string
) {
  const employees = await User.find({ isActive: true, role: 'employee' }, '_id').lean();
  const targets = employees.map((u) => String(u._id));

  if (targets.length === 0) return 0;

  const actualType = type === 'system_announcement' ? 'announcement' : type;

  await Notification.insertMany(
    targets.map((uid) => ({
      userId: uid,
      type: actualType,
      title,
      body,
      isRead: false,
      refId,
      refModel,
    }))
  );

  return targets.length;
}
