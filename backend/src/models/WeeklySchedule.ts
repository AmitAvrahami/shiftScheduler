import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IWeeklySchedule extends Document {
  weekId: string;
  startDate: Date;
  endDate: Date;
  status: 'draft' | 'published' | 'archived';
  generatedBy: 'auto' | 'manual';
  publishedAt?: Date;
  publishedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const weeklyScheduleSchema = new Schema<IWeeklySchedule>(
  {
    weekId: { type: String, required: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      required: true,
      default: 'draft',
    },
    generatedBy: { type: String, enum: ['auto', 'manual'], required: true },
    publishedAt: { type: Date },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const WeeklySchedule: Model<IWeeklySchedule> = mongoose.model<IWeeklySchedule>(
  'WeeklySchedule',
  weeklyScheduleSchema
);
export default WeeklySchedule;
