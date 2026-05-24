import mongoose, { Document, Model, Schema } from 'mongoose';
import type { SolverViolation, SolverWarning } from '../services/solverClient';

// PR10 — persisted schedule quality score from the last generation. Display-only;
// it never gates publish or the weekly workflow. `qualityScore` is intentionally
// omitted until a normalized scoring formula is defined — `totalPenalty` is the v1
// metric (sum of soft-constraint penalties; lower is better). `breakdown` maps each
// soft category to its penalty contribution.
export interface GenerationScore {
  totalPenalty: number;
  qualityScore?: number;
  breakdown: Record<string, number>;
  generatedAt: Date;
}

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
  // PR10 — persisted quality score from the last generation. Shares its
  // `generatedAt` timestamp with `lastGeneratedAt`.
  generationScore?: GenerationScore;
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
    generationScore: { type: Schema.Types.Mixed },
    lastGeneratedAt: { type: Date },
  },
  { timestamps: true }
);

const WeeklySchedule: Model<IWeeklySchedule> = mongoose.model<IWeeklySchedule>(
  'WeeklySchedule',
  weeklyScheduleSchema
);
export default WeeklySchedule;
