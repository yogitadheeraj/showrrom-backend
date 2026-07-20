import mongoose, { Document, Schema } from 'mongoose';

export interface IVehicleTransitRequest extends Document {
  id: string;
  /** Vehicle being requested */
  vehicle_id: string;
  /** Location where the vehicle currently is (source branch) */
  from_location_id: string;
  /** Location requesting the vehicle (destination branch) */
  to_location_id: string;
  /** Sales manager / staff who created the request */
  requested_by_profile_id: string;
  /** ISO timestamp of request creation */
  requested_at: string;
  /**
   * pending   — waiting for source-branch manager approval
   * approved  — approved; transit has been scheduled
   * rejected  — rejected by source manager
   * cancelled — cancelled by requester before decision
   */
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  /** Optional note from the requester (reason for request) */
  requester_notes: string | null;
  /** Comments from the approving / rejecting manager */
  manager_notes: string | null;
  /** Profile ID of the manager who acted on the request */
  actioned_by_profile_id: string | null;
  /** ISO timestamp when manager approved / rejected */
  actioned_at: string | null;
  /** Transit record created on approval */
  scheduled_transit_id: string | null;
  /** Desired test drive date the vehicle is needed for (informational) */
  needed_for_date: string | null;
  /** For multi-dealer: dealer that owns from_location */
  dealer_id: string | null;
  created_at: string;
  updated_at: string;
}

const VehicleTransitRequestSchema = new Schema<IVehicleTransitRequest>(
  {
    id: { type: String, required: true, unique: true, index: true },
    vehicle_id: { type: String, required: true, index: true },
    from_location_id: { type: String, required: true, index: true },
    to_location_id: { type: String, required: true, index: true },
    requested_by_profile_id: { type: String, required: true, index: true },
    requested_at: { type: String, default: () => new Date().toISOString() },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    requester_notes: { type: String, default: null },
    manager_notes: { type: String, default: null },
    actioned_by_profile_id: { type: String, default: null },
    actioned_at: { type: String, default: null },
    scheduled_transit_id: { type: String, default: null },
    needed_for_date: { type: String, default: null },
    dealer_id: { type: String, default: null, index: true },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'vehicle_transit_requests' },
);

VehicleTransitRequestSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

export const VehicleTransitRequest =
  (mongoose.models['VehicleTransitRequest'] as mongoose.Model<IVehicleTransitRequest>) ||
  mongoose.model<IVehicleTransitRequest>('VehicleTransitRequest', VehicleTransitRequestSchema);
