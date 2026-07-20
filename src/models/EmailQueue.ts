import mongoose, { Document, Schema } from 'mongoose';

export type EmailQueueName = 'auth_emails' | 'transactional_emails';

export interface IEmailMessage {
  message_id: string;
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
  label?: string;
  queued_at: string;
  [key: string]: unknown;
}

export interface IEmailQueue extends Document {
  queue: EmailQueueName;
  message: IEmailMessage;
  /** Invisible to workers until this timestamp (visibility timeout) */
  visible_after: Date;
  /** How many times this message has been claimed by a worker */
  tries: number;
  deleted_at: Date | null;
  created_at: Date;
}

const EmailQueueSchema = new Schema<IEmailQueue>(
  {
    queue: { type: String, required: true, index: true },
    message: { type: Schema.Types.Mixed, required: true },
    visible_after: { type: Date, default: () => new Date(), index: true },
    tries: { type: Number, default: 0 },
    deleted_at: { type: Date, default: null },
    created_at: { type: Date, default: () => new Date() },
  },
  { versionKey: false, collection: 'email_queue' },
);

EmailQueueSchema.index({ queue: 1, visible_after: 1, deleted_at: 1 });

export const EmailQueue =
  (mongoose.models['EmailQueue'] as mongoose.Model<IEmailQueue>) ||
  mongoose.model<IEmailQueue>('EmailQueue', EmailQueueSchema);
