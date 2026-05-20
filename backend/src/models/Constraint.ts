import mongoose, { Document, Model, Schema } from 'mongoose';
import { AvailabilityType } from '../utils/constraintAvailability';

export interface IConstraintEntry {
  date: Date;
  definitionId: mongoose.Types.ObjectId;
  canWork: boolean;
  availabilityType?: AvailabilityType;
  startTime?: string;
  endTime?: string;
  note?: string;
}

export interface IConstraint extends Document {
  userId: mongoose.Types.ObjectId;
  weekId: string;
  entries: IConstraintEntry[];
  isLocked: boolean;
  submittedVia: 'self' | 'manager_override';
  overriddenBy?: mongoose.Types.ObjectId | null;
  submittedAt: Date;
  updatedAt: Date;
  createdAt: Date;
}

const constraintEntrySchema = new Schema<IConstraintEntry>(
  {
    date: { type: Date, required: true },
    definitionId: { type: Schema.Types.ObjectId, ref: 'ShiftDefinition', required: true },
    canWork: { type: Boolean, required: true },
    availabilityType: {
      type: String,
      enum: ['available', 'unavailable', 'partial'],
      required: false,
    },
    startTime: { type: String, required: false },
    endTime: { type: String, required: false },
    note: { type: String, required: false },
  },
  { _id: false }
);

const constraintSchema = new Schema<IConstraint>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    weekId: { type: String, required: true, index: true },
    entries: { type: [constraintEntrySchema], default: [] },
    isLocked: { type: Boolean, required: true, default: false },
    submittedVia: {
      type: String,
      enum: ['self', 'manager_override'],
      required: true,
      default: 'self',
    },
    overriddenBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    submittedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

const Constraint: Model<IConstraint> = mongoose.model<IConstraint>('Constraint', constraintSchema);
export default Constraint;
