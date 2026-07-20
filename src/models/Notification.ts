import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  id: string;
  user_id: string;
  profile_id: string | null;
  location_id: string | null;
  title: string;
  body: string;
  type: string;
  reference_id: string | null;
  reference_type: string | null;
  is_read: boolean;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const NotificationSchema = new Schema<INotification>(
  {
    id: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, index: true },
    profile_id: { type: String, default: null },
    location_id: { type: String, default: null },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, required: true, index: true },
    reference_id: { type: String, default: null },
    reference_type: { type: String, default: null },
    is_read: { type: Boolean, default: false, index: true },
    read_at: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
    created_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'notifications' },
);

NotificationSchema.index({ user_id: 1, is_read: 1, created_at: -1 });

export const Notification =
  (mongoose.models['Notification'] as mongoose.Model<INotification>) ||
  mongoose.model<INotification>('Notification', NotificationSchema);
