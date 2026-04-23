import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ISwapRequest extends Document {
  requesterId: mongoose.Types.ObjectId;
  targetUserId: mongoose.Types.ObjectId;
  requesterShiftId: mongoose.Types.ObjectId;
  targetShiftId: mongoose.Types.ObjectId;
  status: 'pending' | 'approved' | 'rejected';
  requesterNote?: string;
  managerNote?: string;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const swapRequestSchema = new Schema<ISwapRequest>(
  {
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requesterShiftId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
    targetShiftId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      required: true,
      default: 'pending',
    },
    requesterNote: { type: String, trim: true },
    managerNote: { type: String, trim: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

const SwapRequest: Model<ISwapRequest> = mongoose.model<ISwapRequest>(
  'SwapRequest',
  swapRequestSchema
);
export default SwapRequest;
