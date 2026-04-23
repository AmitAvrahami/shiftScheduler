import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IShift extends Document {
  scheduleId: mongoose.Types.ObjectId;
  definitionId: mongoose.Types.ObjectId;
  date: Date;
  requiredCount: number;
  status: 'filled' | 'partial' | 'empty';
  notes?: string;
}

const shiftSchema = new Schema<IShift>({
  scheduleId: { type: Schema.Types.ObjectId, ref: 'WeeklySchedule', required: true },
  definitionId: { type: Schema.Types.ObjectId, ref: 'ShiftDefinition', required: true },
  date: { type: Date, required: true, index: true },
  requiredCount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['filled', 'partial', 'empty'],
    required: true,
    default: 'empty',
  },
  notes: { type: String, trim: true },
});

const Shift: Model<IShift> = mongoose.model<IShift>('Shift', shiftSchema);
export default Shift;
