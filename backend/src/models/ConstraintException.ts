import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IConstraintException extends Document {
  employeeId: mongoose.Types.ObjectId;
  weekId: string;
  status: 'pending' | 'approved' | 'denied' | 'consumed';
  requestedAt: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  consumedAt?: Date;
  note?: string;
  managerNote?: string;
}

const constraintExceptionSchema = new Schema<IConstraintException>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    weekId: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'denied', 'consumed'],
      default: 'pending',
    },
    requestedAt: { type: Date, required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    consumedAt: { type: Date },
    note: { type: String, trim: true },
    managerNote: { type: String, trim: true },
  },
  { timestamps: true }
);

constraintExceptionSchema.index({ employeeId: 1, weekId: 1 });
constraintExceptionSchema.index({ status: 1 });

const ConstraintException: Model<IConstraintException> = mongoose.model<IConstraintException>(
  'ConstraintException',
  constraintExceptionSchema
);

export default ConstraintException;
