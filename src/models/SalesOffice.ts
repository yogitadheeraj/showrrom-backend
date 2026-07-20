import mongoose, { Document, Schema } from 'mongoose';

export interface ISalesOffice extends Document {
  id: string;
  orgId: string;
  businessUnitId: string;
  salesOfficeCode: string;
  externalSalesOfficeId: string | null;
  name: string;
  isActive: boolean;
  created_at: string;
  updated_at: string;
}

const SalesOfficeSchema = new Schema<ISalesOffice>(
  {
    id: { type: String, required: true, unique: true, index: true },
    orgId: { type: String, required: true, index: true },
    businessUnitId: { type: String, required: true, index: true },
    salesOfficeCode: { type: String, required: true, unique: true, index: true },
    externalSalesOfficeId: { type: String, default: null, unique: true, sparse: true, index: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true, index: true },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'sales_offices' },
);

SalesOfficeSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

SalesOfficeSchema.index({ orgId: 1, businessUnitId: 1 });

export const SalesOffice =
  (mongoose.models['SalesOffice'] as mongoose.Model<ISalesOffice>) ||
  mongoose.model<ISalesOffice>('SalesOffice', SalesOfficeSchema);
