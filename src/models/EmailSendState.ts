import mongoose, { Document, Schema } from 'mongoose';

export interface IEmailSendState extends Document {
  key: string;
  retry_after_until: Date | null;
  batch_size: number;
  send_delay_ms: number;
  auth_email_ttl_minutes: number;
  transactional_email_ttl_minutes: number;
  updated_at: Date;
}

const EmailSendStateSchema = new Schema<IEmailSendState>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    retry_after_until: { type: Date, default: null },
    batch_size: { type: Number, default: 10 },
    send_delay_ms: { type: Number, default: 200 },
    auth_email_ttl_minutes: { type: Number, default: 15 },
    transactional_email_ttl_minutes: { type: Number, default: 60 },
    updated_at: { type: Date, default: () => new Date() },
  },
  { versionKey: false, collection: 'email_send_state' },
);

export const EmailSendState =
  (mongoose.models['EmailSendState'] as mongoose.Model<IEmailSendState>) ||
  mongoose.model<IEmailSendState>('EmailSendState', EmailSendStateSchema);
