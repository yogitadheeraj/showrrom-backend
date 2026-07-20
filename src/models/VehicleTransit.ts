import mongoose, { Document, Schema } from 'mongoose';

export type TransitStatus = 'scheduled' | 'in_transit' | 'arrived' | 'cancelled';
export type TransitTrigger = 'auto' | 'manual';

export interface IVehicleTransit extends Document {
  id: string;
  vehicle_id: string;
  from_location_id: string;
  to_location_id: string;
  trigger: TransitTrigger;
  /** Test drive that ended and triggered this transit */
  triggered_by_test_drive_id: string | null;
  /** Test drive at destination that this transit serves */
  for_test_drive_id: string | null;
  distance_km: number | null;
  transit_minutes: number | null;
  /** ISO: when vehicle is scheduled to depart from_location */
  depart_time: string;
  /** ISO: expected arrival at to_location */
  eta_time: string;
  status: TransitStatus;
  dispatched_at: string | null;
  arrived_at: string | null;
  notes: string | null;
  /** Profile ID of the person who scheduled this transit */
  scheduled_by_profile_id: string | null;
  /** Security staff profile ID assigned to receive vehicle at to_location */
  receiver_profile_id: string | null;
  /** When the receiver was assigned */
  receiver_assigned_at: string | null;
  /** Notes added by the security receiver on arrival */
  received_notes: string | null;
  created_at: string;
  updated_at: string;
}

const VehicleTransitSchema = new Schema<IVehicleTransit>(
  {
    id: { type: String, required: true, unique: true, index: true },
    vehicle_id: { type: String, required: true, index: true },
    from_location_id: { type: String, required: true, index: true },
    to_location_id: { type: String, required: true, index: true },
    trigger: { type: String, enum: ['auto', 'manual'], default: 'auto' },
    triggered_by_test_drive_id: { type: String, default: null },
    for_test_drive_id: { type: String, default: null },
    distance_km: { type: Number, default: null },
    transit_minutes: { type: Number, default: null },
    depart_time: { type: String, required: true },
    eta_time: { type: String, required: true },
    status: {
      type: String,
      enum: ['scheduled', 'in_transit', 'arrived', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    dispatched_at: { type: String, default: null },
    arrived_at: { type: String, default: null },
    notes: { type: String, default: null },
    scheduled_by_profile_id: { type: String, default: null, index: true },
    receiver_profile_id: { type: String, default: null, index: true },
    receiver_assigned_at: { type: String, default: null },
    received_notes: { type: String, default: null },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'vehicle_transits' },
);

VehicleTransitSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

export const VehicleTransit =
  (mongoose.models['VehicleTransit'] as mongoose.Model<IVehicleTransit>) ||
  mongoose.model<IVehicleTransit>('VehicleTransit', VehicleTransitSchema);
