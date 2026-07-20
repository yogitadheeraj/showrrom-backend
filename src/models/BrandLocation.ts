import mongoose, { Document, Schema } from 'mongoose';

/** Junction table: links a Brand to a Location (many-to-many). */
export interface IBrandLocation extends Document {
  id: string;
  orgId: string;
  brandId: string;
  locationId: string;
  businessUnitId: string | null;
  isActive: boolean;
  created_at: string;
  updated_at: string;
}

const BrandLocationSchema = new Schema<IBrandLocation>(
  {
    id:             { type: String, required: true, unique: true, index: true },
    orgId:          { type: String, required: true, index: true },
    brandId:        { type: String, required: true, index: true },
    locationId:     { type: String, required: true, index: true },
    businessUnitId: { type: String, default: null, index: true },
    isActive:       { type: Boolean, default: true, index: true },
    created_at:     { type: String, default: () => new Date().toISOString() },
    updated_at:     { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'brand_locations' },
);

BrandLocationSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

BrandLocationSchema.index({ orgId: 1, brandId: 1, locationId: 1 }, { unique: true });

export const BrandLocation =
  (mongoose.models['BrandLocation'] as mongoose.Model<IBrandLocation>) ||
  mongoose.model<IBrandLocation>('BrandLocation', BrandLocationSchema);
