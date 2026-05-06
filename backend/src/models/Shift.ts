import mongoose, { Document, Model, Schema } from 'mongoose';
import ShiftDefinition from './ShiftDefinition';

export interface IShift extends Document {
  scheduleId: mongoose.Types.ObjectId;
  definitionId: mongoose.Types.ObjectId;
  shiftDefinitionId: mongoose.Types.ObjectId;
  date: Date;
  startTime: string;
  endTime: string;
  startsAt: Date;
  endsAt: Date;
  requiredCount: number;
  status: 'filled' | 'partial' | 'empty';
  notes?: string;
  templateStatus?: 'matching_template' | 'manually_modified';
}

const DAY_MS = 24 * 60 * 60 * 1000;

function buildDateTime(date: Date, time: string): Date | null {
  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
}

const shiftSchema = new Schema<IShift>(
  {
    scheduleId: { type: Schema.Types.ObjectId, ref: 'WeeklySchedule', required: true },
    definitionId: {
      type: Schema.Types.ObjectId,
      ref: 'ShiftDefinition',
      required: true,
      alias: 'shiftDefinitionId',
    },
    date: { type: Date, required: true, index: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    requiredCount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['filled', 'partial', 'empty'],
      required: true,
      default: 'empty',
    },
    notes: { type: String, trim: true },
    templateStatus: {
      type: String,
      enum: ['matching_template', 'manually_modified'],
      default: 'matching_template',
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

shiftSchema.pre('validate', async function fillTimeSnapshot(next) {
  try {
    if (!this.startTime || !this.endTime) {
      const definition = await ShiftDefinition.findById(this.definitionId).lean();
      if (!definition) return next();

      this.startTime = definition.startTime;
      this.endTime = definition.endTime;
    }

    if (this.date && this.startTime && this.endTime && (!this.startsAt || !this.endsAt)) {
      const startsAt = buildDateTime(this.date, this.startTime);
      const endsAt = buildDateTime(this.date, this.endTime);
      if (startsAt && endsAt) {
        this.startsAt = startsAt;
        this.endsAt = endsAt <= startsAt ? new Date(endsAt.getTime() + DAY_MS) : endsAt;
      }
    }

    return next();
  } catch (err) {
    return next(err as Error);
  }
});

const Shift: Model<IShift> = mongoose.model<IShift>('Shift', shiftSchema);
export default Shift;
