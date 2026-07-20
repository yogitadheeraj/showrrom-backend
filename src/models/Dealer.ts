import mongoose, { Document, Schema } from 'mongoose';

export interface IDealer extends Document {
  id: string;
  code: string | null;
  name: string;
  slug: string;
  contact_email: string;
  contact_phone: string | null;
  logo_url: string | null;
  is_active: boolean;
  admin_user_id: string | null;
  created_at: string;
  updated_at: string;
}

const DealerSchema = new Schema<IDealer>(
  {
    id: { type: String, required: true, unique: true, index: true },
    code: { type: String, default: null, unique: true, sparse: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    contact_email: { type: String, required: true },
    contact_phone: { type: String, default: null },
    logo_url: { type: String, default: null },
    is_active: { type: Boolean, default: true },
    admin_user_id: { type: String, default: null },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'dealers' },
);

DealerSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

export const Dealer =
  (mongoose.models['Dealer'] as mongoose.Model<IDealer>) ||
  mongoose.model<IDealer>('Dealer', DealerSchema);
