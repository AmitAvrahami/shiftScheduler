import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IShiftDefinition extends Document {
  name: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  crossesMidnight: boolean;
  color: string;
  isActive: boolean;
  orderNumber: number;
  coverageRequirements: {
    weekday: number;
    weekend: number;
  };
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const shiftDefinitionSchema = new Schema<IShiftDefinition>(
  {
    name: { type: String, required: true, trim: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, required: true },
    crossesMidnight: { type: Boolean, required: true, default: false },
    color: { type: String, required: true, trim: true },
    isActive: { type: Boolean, required: true, default: true },
    orderNumber: { type: Number, required: true },
    coverageRequirements: {
      weekday: { type: Number, required: true, default: 2 },
      weekend: { type: Number, required: true, default: 1 },
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
