import mongoose, { Document, Model, Schema } from 'mongoose';
import ShiftDefinition from './ShiftDefinition';

export interface IShift extends Document {
  scheduleId: mongoose.Types.ObjectId;
  definitionId: mongoose.Types.ObjectId;
  shiftDefinitionId: mongoose.Types.ObjectId;
  date: Date;
  startTime: string;
  endTime: string;
  requiredCount: number;
  status: 'filled' | 'partial' | 'empty';
  notes?: string;
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
    requiredCount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['filled', 'partial', 'empty'],
      required: true,
      default: 'empty',
    },
    notes: { type: String, trim: true },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

shiftSchema.pre('validate', async function fillTimeSnapshot(next) {
  if (this.startTime && this.endTime) return next();

  const definition = await ShiftDefinition.findById(this.definitionId).lean();
  if (!definition) return next();

  this.startTime = definition.startTime;
  this.endTime = definition.endTime;
  return next();
});

const Shift: Model<IShift> = mongoose.model<IShift>('Shift', shiftSchema);
export default Shift;
