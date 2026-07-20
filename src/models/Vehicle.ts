import mongoose, { Document, Schema } from 'mongoose';

export interface IVehicle extends Omit<Document, 'model'> {
  id: string;
  orgId: string | null;
  businessUnitId: string | null;
  brandId: string | null;
  salesOfficeId: string | null;
  plantId: string | null;
  condition: string | null;
  status: string | null;
  vin: string | null;
  stockNumber: string | null;
  brand: string;
  model: string;
  variant: string | null;
  trim: string | null;
  year: number;
  color: string | null;
  fuel_type: string | null;
  transmission: string | null;
  engine_type: string | null;
  drive_type: string | null;
  horsepower: number | null;
  torque: string | null;
  top_speed: string | null;
  acceleration: string | null;
  mileage: string | null;
  battery_capacity: string | null;
  range_km: number | null;
  seating_capacity: number | null;
  vehicle_segment: string | null;
  vehicle_condition: string | null;
  grade: string | null;
  image_url: string | null;
  registration_number: string | null;
  set_price: number | null;
  available_units: number;
  total_units: number;
  location_id: string;
  is_active: boolean;
  is_available: boolean;
  is_new: boolean;
  is_used: boolean;
  is_demo: boolean | null;
  demo_for_vehicle_id: string | null;
  vehicle_time_days: number | null;
  // ── Shared fleet fields ───────────────────────────────────────────────────
  is_shared: boolean;
  /**
   * Which locations can book this shared vehicle.
   * Empty array (default) = available at ALL locations.
   * Non-empty = only those specific location IDs.
   */
  shared_location_ids: string[];
  /** Where the vehicle physically is right now (may differ from home location_id) */
  current_location_id: string | null;
  /** 'at_location' | 'in_transit' */
  transit_status: string;
  /** ISO timestamp: when vehicle is expected to arrive at transit_to_location_id */
  transit_eta: string | null;
  /** Destination location during transit */
  transit_to_location_id: string | null;
  created_at: string;
  updated_at: string;
}

const VehicleSchema = new Schema<IVehicle>(
  {
    id: { type: String, required: true, unique: true, index: true },
    orgId: { type: String, default: null, index: true },
    businessUnitId: { type: String, default: null, index: true },
    brandId: { type: String, default: null, index: true },
    salesOfficeId: { type: String, default: null, index: true },
    plantId: { type: String, default: null, index: true },
    condition: { type: String, default: null, index: true },
    status: { type: String, default: 'available', index: true },
    vin: { type: String, sparse: true },
    stockNumber: { type: String, sparse: true },
    brand: { type: String, required: true, index: true },
    model: { type: String, required: true, index: true },
    variant: { type: String, default: null },
    trim: { type: String, default: null },
    year: { type: Number, required: true },
    color: { type: String, default: null },
    fuel_type: { type: String, default: null },
    transmission: { type: String, default: null },
    engine_type: { type: String, default: null },
    drive_type: { type: String, default: null },
    horsepower: { type: Number, default: null },
    torque: { type: String, default: null },
    top_speed: { type: String, default: null },
    acceleration: { type: String, default: null },
    mileage: { type: String, default: null },
    battery_capacity: { type: String, default: null },
    range_km: { type: Number, default: null },
    seating_capacity: { type: Number, default: null },
    vehicle_segment: { type: String, default: null },
    vehicle_condition: { type: String, default: null },
    grade: { type: String, default: null },
    image_url: { type: String, default: null },
    registration_number: { type: String, default: null },
    set_price: { type: Number, default: null },
    available_units: { type: Number, default: 1 },
    total_units: { type: Number, default: 1 },
    location_id: { type: String, required: true, index: true },
    is_active: { type: Boolean, default: true },
    is_available: { type: Boolean, default: true },
    is_new: { type: Boolean, default: true },
    is_used: { type: Boolean, default: false },
    is_demo: { type: Boolean, default: null },
    demo_for_vehicle_id: { type: String, default: null },
    vehicle_time_days: { type: Number, default: null },
    // ── Shared fleet fields ───────────────────────────────────────────────────
    is_shared: { type: Boolean, default: false, index: true },
    shared_location_ids: { type: [String], default: [] },
    current_location_id: { type: String, default: null, index: true },
    transit_status: { type: String, default: 'at_location' },
    transit_eta: { type: String, default: null },
    transit_to_location_id: { type: String, default: null },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'vehicles' },
);

VehicleSchema.pre('save', function (next) {
  if (!this.condition && this.vehicle_condition) {
    this.condition = this.vehicle_condition;
  }
  this.updated_at = new Date().toISOString();
  next();
});

VehicleSchema.index({ vin: 1 }, { unique: false, sparse: true, name: 'vin_sparse_idx' });
VehicleSchema.index({ orgId: 1, businessUnitId: 1, brandId: 1, condition: 1 });
VehicleSchema.index({ salesOfficeId: 1, plantId: 1, location_id: 1 });

export const Vehicle =
  (mongoose.models['Vehicle'] as mongoose.Model<IVehicle>) ||
  mongoose.model<IVehicle>('Vehicle', VehicleSchema);
