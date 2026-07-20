import mongoose, { Document, Schema } from 'mongoose';

export interface IProfile extends Document {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  location_id: string | null;
  brand_ids: string[];
  is_active: boolean;
  on_leave: boolean;
  leave_start_date: string | null;
  leave_end_date: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

const ProfileSchema = new Schema<IProfile>(
  {
    id: { type: String, required: true, unique: true, index: true },
    user_id: { type: String, required: true, unique: true, index: true },
    full_name: { type: String, required: true },
    email: { type: String, required: true, index: true },
    phone: { type: String, default: null },
    avatar_url: { type: String, default: null },
    location_id: { type: String, default: null, index: true },
    brand_ids: { type: [String], default: [] },
    is_active: { type: Boolean, default: true },
    on_leave: { type: Boolean, default: false },
    leave_start_date: { type: String, default: null },
    leave_end_date: { type: String, default: null },
    last_login_at: { type: String, default: null },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'profiles' },
);

ProfileSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

export const Profile =
  (mongoose.models['Profile'] as mongoose.Model<IProfile>) ||
  mongoose.model<IProfile>('Profile', ProfileSchema);
