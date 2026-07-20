import mongoose, { Document, Schema } from 'mongoose';

export interface IEmailUnsubscribeToken extends Document {
  token: string;
  email: string;
  unsubscribed_at: Date | null;
  created_at: Date;
}

const EmailUnsubscribeTokenSchema = new Schema<IEmailUnsubscribeToken>(
  {
    token: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, index: true },
    unsubscribed_at: { type: Date, default: null },
    created_at: { type: Date, default: () => new Date() },
  },
  { versionKey: false, collection: 'email_unsubscribe_tokens' },
);

export const EmailUnsubscribeToken =
  (mongoose.models['EmailUnsubscribeToken'] as mongoose.Model<IEmailUnsubscribeToken>) ||
  mongoose.model<IEmailUnsubscribeToken>('EmailUnsubscribeToken', EmailUnsubscribeTokenSchema);
