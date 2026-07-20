import mongoose, { Document, Schema } from 'mongoose';

export interface ICustomer extends Document {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  preferred_contact: string;
  driving_license_url: string | null;
  driving_license_verified: boolean;
  total_test_drives: number;
  created_at: string;
  updated_at: string;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    id: { type: String, required: true, unique: true, index: true },
    full_name: { type: String, required: true },
    phone: { type: String, required: true, index: true },
    email: { type: String, default: null, index: true },
    preferred_contact: { type: String, default: 'phone' },
    driving_license_url: { type: String, default: null },
    driving_license_verified: { type: Boolean, default: false },
    total_test_drives: { type: Number, default: 0 },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'customers' },
);

CustomerSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

export const Customer =
  (mongoose.models['Customer'] as mongoose.Model<ICustomer>) ||
  mongoose.model<ICustomer>('Customer', CustomerSchema);
