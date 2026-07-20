import mongoose, { Document, Schema } from 'mongoose';

export interface IStaffActivitySession extends Document {
  id: string;
  user_id: string;
  profile_id: string | null;
  location_id: string | null;
  role: string | null;
  session_source: string | null;
  login_at: string;
  logout_at: string | null;
  last_seen_at: string;
  is_online: boolean;
  active_seconds: number;
  idle_seconds: number;
  created_at: string;
}

const StaffActivitySessionSchema = new Schema<IStaffActivitySession>(
  {
    id: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, index: true },
    profile_id: { type: String, default: null, index: true },
    location_id: { type: String, default: null, index: true },
    role: { type: String, default: null },
    session_source: { type: String, default: null },
    login_at: { type: String, default: () => new Date().toISOString() },
    logout_at: { type: String, default: null },
    last_seen_at: { type: String, default: () => new Date().toISOString() },
    is_online: { type: Boolean, default: true },
    active_seconds: { type: Number, default: 0 },
    idle_seconds: { type: Number, default: 0 },
    created_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'staff_activity_sessions' },
);

StaffActivitySessionSchema.index({ user_id: 1, is_online: 1 });
StaffActivitySessionSchema.index({ location_id: 1, is_online: 1 });

export const StaffActivitySession =
  (mongoose.models['StaffActivitySession'] as mongoose.Model<IStaffActivitySession>) ||
  mongoose.model<IStaffActivitySession>('StaffActivitySession', StaffActivitySessionSchema);
