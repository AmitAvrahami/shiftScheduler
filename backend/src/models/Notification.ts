import mongoose, { Document, Model, Schema } from 'mongoose';

export type NotificationType =
  | 'schedule_published'
  | 'schedule_updated'
  | 'schedule_deleted'
  | 'constraint_updated'
  | 'swap_request_reviewed';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  refId?: mongoose.Types.ObjectId;
  refModel?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'schedule_published',
        'schedule_updated',
        'schedule_deleted',
        'constraint_updated',
        'swap_request_reviewed',
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    isRead: { type: Boolean, required: true, default: false, index: true },
    refId: { type: Schema.Types.ObjectId },
    refModel: { type: String, trim: true },
  },
  { timestamps: true }
);

// Compound index for fetching unread notifications per user efficiently
notificationSchema.index({ userId: 1, isRead: 1 });
// Index for time-based queries and cleanup
notificationSchema.index({ createdAt: 1 });

const Notification: Model<INotification> = mongoose.model<INotification>(
  'Notification',
  notificationSchema
);
export default Notification;
