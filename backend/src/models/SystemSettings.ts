import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ISystemSettings extends Document {
  key: string;
  value: unknown;
  description?: string;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt?: Date;
}

const systemSettingsSchema = new Schema<ISystemSettings>({
  key: { type: String, required: true, unique: true, trim: true },
  value: { type: Schema.Types.Mixed, required: true },
  description: { type: String, trim: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date },
});

const SystemSettings: Model<ISystemSettings> = mongoose.model<ISystemSettings>(
  'SystemSettings',
  systemSettingsSchema
);
export default SystemSettings;
