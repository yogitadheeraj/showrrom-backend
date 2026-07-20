import mongoose, { Document, Schema } from 'mongoose';

export type ReminderToneType = 'classic' | 'soft' | 'alert';

export interface IFollowUpReminderConfig extends Document {
  id: string;
  location_id: string;
  dealer_id: string | null;
  reminder_enabled: boolean;
  reminder_before_minutes: number;
  reminder_message: string;
  tone_type: ReminderToneType;
  notify_due_list: boolean;
  updated_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

const FollowUpReminderConfigSchema = new Schema<IFollowUpReminderConfig>(
  {
    id: { type: String, required: true, unique: true, index: true },
    location_id: { type: String, required: true, index: true, unique: true },
    reminder_enabled: { type: Boolean, default: true },
    reminder_before_minutes: { type: Number, default: 30, min: 1, max: 120 },
    reminder_message: {
      type: String,
      default: 'Follow-up due soon: {{title}} at {{dueAt}}',
    },
    tone_type: {
      type: String,
      enum: ['classic', 'soft', 'alert'],
      default: 'classic',
    },
    notify_due_list: { type: Boolean, default: true },
    updated_by_profile_id: { type: String, default: null },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'follow_up_reminder_config' },
);

FollowUpReminderConfigSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

FollowUpReminderConfigSchema.index({ dealer_id: 1 });

export const FollowUpReminderConfig =
  (mongoose.models['FollowUpReminderConfig'] as mongoose.Model<IFollowUpReminderConfig>) ||
  mongoose.model<IFollowUpReminderConfig>('FollowUpReminderConfig', FollowUpReminderConfigSchema);
