import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IShiftDefinition extends Document {
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  durationMinutes: number;
  crossesMidnight: boolean;
  color: string;
  isActive: boolean;
  orderNumber: number;
  requiredStaffCount: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const shiftDefinitionSchema = new Schema<IShiftDefinition>(
  {
    name: { type: String, required: true, trim: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    daysOfWeek: {
      type: [Number],
      required: true,
      default: [0, 1, 2, 3, 4, 5, 6],
      validate: {
        validator(days: number[]): boolean {
          return days.length > 0 && days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6);
        },
        message: 'daysOfWeek must contain day numbers between 0 and 6',
      },
    },
    durationMinutes: { type: Number, required: true },
    crossesMidnight: { type: Boolean, required: true, default: false },
    color: { type: String, required: true, trim: true },
    isActive: { type: Boolean, required: true, default: true },
    orderNumber: { type: Number, required: true },
    requiredStaffCount: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      validate: {
        validator(value: number): boolean {
          return Number.isInteger(value);
        },
        message: 'requiredStaffCount must be a positive integer',
      },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const ShiftDefinition: Model<IShiftDefinition> = mongoose.model<IShiftDefinition>(
  'ShiftDefinition',
  shiftDefinitionSchema
);
export default ShiftDefinition;
