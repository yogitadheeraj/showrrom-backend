import mongoose, { Document, Schema } from 'mongoose';

export interface IStaffActivityEvent extends Document {
  id: string;
  user_id: string;
  profile_id: string | null;
  session_id: string | null;
  location_id: string | null;
  event_type: string;
  event_label: string | null;
  route: string | null;
  role: string | null;
  metadata: Record<string, unknown> | null;
  happened_at: string;
  created_at: string;
}

const StaffActivityEventSchema = new Schema<IStaffActivityEvent>(
  {
    id: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, index: true },
    profile_id: { type: String, default: null, index: true },
    session_id: { type: String, default: null, index: true },
    location_id: { type: String, default: null, index: true },
    event_type: { type: String, required: true, index: true },
    event_label: { type: String, default: null },
    route: { type: String, default: null },
    role: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
    happened_at: { type: String, default: () => new Date().toISOString() },
    created_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'staff_activity_events' },
);

StaffActivityEventSchema.index({ user_id: 1, happened_at: -1 });
StaffActivityEventSchema.index({ location_id: 1, happened_at: -1 });

export const StaffActivityEvent =
  (mongoose.models['StaffActivityEvent'] as mongoose.Model<IStaffActivityEvent>) ||
  mongoose.model<IStaffActivityEvent>('StaffActivityEvent', StaffActivityEventSchema);
