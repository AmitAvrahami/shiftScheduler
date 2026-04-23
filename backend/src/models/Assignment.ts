import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAssignment extends Document {
  shiftId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  scheduleId: mongoose.Types.ObjectId;
  assignedBy: 'algorithm' | 'manager';
  status: 'confirmed' | 'pending';
  confirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const assignmentSchema = new Schema<IAssignment>(
  {
    shiftId: { type: Schema.Types.ObjectId, ref: 'Shift', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scheduleId: { type: Schema.Types.ObjectId, ref: 'WeeklySchedule', required: true },
    assignedBy: { type: String, enum: ['algorithm', 'manager'], required: true },
    status: {
      type: String,
      enum: ['confirmed', 'pending'],
      required: true,
      default: 'pending',
    },
    confirmedAt: { type: Date },
  },
  { timestamps: true }
);

const Assignment: Model<IAssignment> = mongoose.model<IAssignment>('Assignment', assignmentSchema);
export default Assignment;
