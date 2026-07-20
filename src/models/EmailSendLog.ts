import mongoose, { Document, Schema } from 'mongoose';

export type EmailSendStatus = 'sent' | 'failed' | 'rate_limited' | 'dlq';

export interface IEmailSendLog extends Document {
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: EmailSendStatus;
  error_message: string | null;
  created_at: Date;
}

const EmailSendLogSchema = new Schema<IEmailSendLog>(
  {
    message_id: { type: String, default: null, index: true },
    template_name: { type: String, required: true },
    recipient_email: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['sent', 'failed', 'rate_limited', 'dlq'],
      required: true,
      index: true,
    },
    error_message: { type: String, default: null },
    created_at: { type: Date, default: () => new Date() },
  },
  { versionKey: false, collection: 'email_send_log' },
);

EmailSendLogSchema.index({ message_id: 1, status: 1 });

export const EmailSendLog =
  (mongoose.models['EmailSendLog'] as mongoose.Model<IEmailSendLog>) ||
  mongoose.model<IEmailSendLog>('EmailSendLog', EmailSendLogSchema);
