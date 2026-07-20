import mongoose, { Document, Schema } from 'mongoose';

export interface IBusinessUnitBrand extends Document {
  id: string;
  businessUnitId: string;
  brandId: string;
  isActive: boolean;
  created_at: string;
  updated_at: string;
}

const BusinessUnitBrandSchema = new Schema<IBusinessUnitBrand>(
  {
    id: { type: String, required: true, unique: true, index: true },
    businessUnitId: { type: String, required: true, index: true },
    brandId: { type: String, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'business_unit_brands' },
);

BusinessUnitBrandSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

BusinessUnitBrandSchema.index({ businessUnitId: 1, brandId: 1 }, { unique: true });

export const BusinessUnitBrand =
  (mongoose.models['BusinessUnitBrand'] as mongoose.Model<IBusinessUnitBrand>) ||
  mongoose.model<IBusinessUnitBrand>('BusinessUnitBrand', BusinessUnitBrandSchema);
