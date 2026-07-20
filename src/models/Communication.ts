import mongoose, { Document, Schema } from 'mongoose';

export interface ICommunication extends Document {
  id: string;
  customer_id: string;
  test_drive_id: string | null;
  parent_id: string | null;
  type: string;
  purpose: string;
  sent_to: string;
  subject: string | null;
  body: string | null;
  status: string;
  external_id: string | null;
  sent_at: string | null;
  created_at: string;
}

const CommunicationSchema = new Schema<ICommunication>(
  {
    id: { type: String, required: true, unique: true, index: true },
    customer_id: { type: String, required: true, index: true },
    test_drive_id: { type: String, default: null, index: true },
    parent_id: { type: String, default: null },
    type: { type: String, required: true },
    purpose: { type: String, required: true },
    sent_to: { type: String, required: true },
    subject: { type: String, default: null },
    body: { type: String, default: null },
    status: { type: String, default: 'pending', index: true },
    external_id: { type: String, default: null },
    sent_at: { type: String, default: null },
    created_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'communications' },
);

CommunicationSchema.index({ customer_id: 1, created_at: -1 });

export const Communication =
  (mongoose.models['Communication'] as mongoose.Model<ICommunication>) ||
  mongoose.model<ICommunication>('Communication', CommunicationSchema);
