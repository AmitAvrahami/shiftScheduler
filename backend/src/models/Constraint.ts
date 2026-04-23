import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IConstraintEntry {
  date: Date;
  definitionId: mongoose.Types.ObjectId;
  canWork: boolean;
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
