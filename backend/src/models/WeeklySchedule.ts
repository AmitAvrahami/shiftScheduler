import mongoose, { Document, Model, Schema } from 'mongoose';
import type { SolverViolation, SolverWarning } from '../services/solverClient';

export interface IWeeklySchedule extends Document {
  weekId: string;
  startDate: Date;
  endDate: Date;
  status: 'open' | 'locked' | 'generating' | 'draft' | 'published' | 'archived';
  generatedBy: 'auto' | 'manual';
  publishedAt?: Date;
  publishedBy?: mongoose.Types.ObjectId;
  // Latest solver output from generation — persisted so soft-constraint warnings
  // survive page reloads and remain visible on the schedule board (PR09).
  // Stored verbatim (snake_case) so the wire shape matches the frontend.
  generationWarnings?: SolverWarning[];
  generationViolations?: SolverViolation[];
  lastGeneratedAt?: Date;
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
      enum: ['open', 'locked', 'generating', 'draft', 'published', 'archived'],
      required: true,
      default: 'open',
    },
    generatedBy: { type: String, enum: ['auto', 'manual'], required: true },
    publishedAt: { type: Date },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    generationWarnings: { type: [Schema.Types.Mixed], default: [] },
    generationViolations: { type: [Schema.Types.Mixed], default: [] },
    lastGeneratedAt: { type: Date },
  },
  { timestamps: true }
);

const WeeklySchedule: Model<IWeeklySchedule> = mongoose.model<IWeeklySchedule>(
  'WeeklySchedule',
  weeklyScheduleSchema
);
export default WeeklySchedule;
