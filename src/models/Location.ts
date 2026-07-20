import mongoose, { Document, Schema } from 'mongoose';

export interface ILocation extends Document {
  id: string;
  dealer_id: string | null;
  orgId: string | null;
  businessUnitId: string | null;
  businessUnitName: string | null;
  salesOfficeId: string | null;
  salesOfficeName: string | null;
  plantId: string | null;
  plantName: string | null;
  brandId: string | null;
  brandName: string | null;
  locationCode: string | null;
  externalLocationId: string | null;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  latitude: string | null;
  longitude: string | null;
  googleplaceid: string | null;
  maplink: string | null;
  currency_type: string | null;
  is_active: boolean;
  slot_duration_minutes: number;
  max_concurrent_test_drives: number;
  advance_booking_days: number;
  public_booking_rate_limit_minutes: number;
  time_zone: string | null;
  created_at: string;
  updated_at: string;
}

const LocationSchema = new Schema<ILocation>(
  {
    id: { type: String, required: true, unique: true, index: true },
    dealer_id: { type: String, default: null, index: true },
    orgId: { type: String, default: null, index: true },
    businessUnitId: { type: String, default: null, index: true },
    businessUnitName: { type: String, default: null },
    salesOfficeId: { type: String, default: null, index: true },
    salesOfficeName: { type: String, default: null },
    plantId: { type: String, default: null, index: true },
    plantName: { type: String, default: null },
    brandId: { type: String, default: null, index: true },
    brandName: { type: String, default: null },
    locationCode: { type: String, default: null, unique: true, sparse: true, index: true },
    externalLocationId: { type: String, default: null, unique: true, sparse: true, index: true },
    name: { type: String, required: true },
    city: { type: String, default: null },
    state: { type: String, default: null },
    country: { type: String, default: null },
    address: { type: String, default: null },
    pincode: { type: String, default: null },
    phone: { type: String, default: null },
    email: { type: String, default: null },
    latitude: { type: String, default: null },
    longitude: { type: String, default: null },
    googleplaceid: { type: String, default: null },
    maplink: { type: String, default: null },
    currency_type: { type: String, default: null },
    is_active: { type: Boolean, default: true },
    slot_duration_minutes: { type: Number, default: 30 },
    max_concurrent_test_drives: { type: Number, default: 1 },
    advance_booking_days: { type: Number, default: 30 },
    public_booking_rate_limit_minutes: { type: Number, default: 10 },
    time_zone: { type: String, default: null },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'locations' },
);

LocationSchema.pre('save', function (next) {
  if (!this.orgId && this.dealer_id) {
    this.orgId = this.dealer_id;
  }
  if (!this.dealer_id && this.orgId) {
    this.dealer_id = this.orgId;
  }
  this.updated_at = new Date().toISOString();
  next();
});

LocationSchema.index({ orgId: 1, businessUnitId: 1, salesOfficeId: 1, plantId: 1 });

export const Location = mongoose.models['Location'] as mongoose.Model<ILocation> || mongoose.model<ILocation>('Location', LocationSchema);
