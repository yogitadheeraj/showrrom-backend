import mongoose, { Document, Schema } from 'mongoose';

export type TestDriveStatus =
  | 'scheduled'
  | 'confirmed'
  | 'show'
  | 'in_progress'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'rescheduled';

export interface ITestDrive extends Document {
  id: string;
  customer_id: string;
  vehicle_id: string;
  location_id: string;
  source: string;
  source_name: string | null;
  metadata: Record<string, unknown> | null;
  assigned_sales_person_id: string | null;
  assigned_gro_id: string | null;
  gro_id: string | null;
  assigned_security_person_id: string | null;
  status: TestDriveStatus;
  scheduled_date: string;
  scheduled_time: string;
  slot_duration_minutes: number;
  started_at: string | null;
  completed_at: string | null;
  security_checked_in_at: string | null;
  security_checked_out_at: string | null;
  key_handed_at: string | null;
  inspection_submitted_at: string | null;
  pre_drive_km: number | null;
  post_drive_km: number | null;
  pre_drive_fuel_level: string | null;
  post_drive_fuel_level: string | null;
  pre_drive_notes: string | null;
  post_drive_notes: string | null;
  pre_drive_scratches: string | null;
  post_drive_scratches: string | null;
  rescheduled_from: string | null;
  notes: string | null;
  cancelled_reason: string | null;
  cancellation_reason: string | null;
  feedback_submitted: boolean;
  inspection_checklist: Record<string, unknown> | null;
  stage: string | null;
  /** Email reminder tracking */
  reminder_sent_24h: boolean;
  reminder_sent_4h: boolean;
  thank_you_sent: boolean;
  no_show_reengagement_sent: boolean;
  created_at: string;
  updated_at: string;
}

const TestDriveSchema = new Schema<ITestDrive>(
  {
    id: { type: String, required: true, unique: true, index: true },
    customer_id: { type: String, required: true, index: true },
    vehicle_id: { type: String, required: true, index: true },
    location_id: { type: String, required: true, index: true },
    source: { type: String, default: 'online', index: true },
    source_name: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
    assigned_sales_person_id: { type: String, default: null, index: true },
    assigned_gro_id: { type: String, default: null, index: true },
    gro_id: { type: String, default: null },
    assigned_security_person_id: { type: String, default: null, index: true },
    status: {
      type: String,
      enum: ['scheduled', 'confirmed', 'show', 'in_progress', 'completed', 'no_show', 'cancelled', 'rescheduled'],
      default: 'scheduled',
      index: true,
    },
    scheduled_date: { type: String, required: true, index: true },
    scheduled_time: { type: String, required: true },
    slot_duration_minutes: { type: Number, default: 30 },
    started_at: { type: String, default: null },
    completed_at: { type: String, default: null },
    security_checked_in_at: { type: String, default: null },
    security_checked_out_at: { type: String, default: null },
    key_handed_at: { type: String, default: null },
    inspection_submitted_at: { type: String, default: null },
    pre_drive_km: { type: Number, default: null },
    post_drive_km: { type: Number, default: null },
    pre_drive_fuel_level: { type: String, default: null },
    post_drive_fuel_level: { type: String, default: null },
    pre_drive_notes: { type: String, default: null },
    post_drive_notes: { type: String, default: null },
    pre_drive_scratches: { type: String, default: null },
    post_drive_scratches: { type: String, default: null },
    rescheduled_from: { type: String, default: null, index: true },
    notes: { type: String, default: null },
    cancelled_reason: { type: String, default: null },
    cancellation_reason: { type: String, default: null },
    feedback_submitted: { type: Boolean, default: false },
    inspection_checklist: { type: Schema.Types.Mixed, default: null },
    stage: { type: String, default: null },
    reminder_sent_24h: { type: Boolean, default: false },
    reminder_sent_4h: { type: Boolean, default: false },
    thank_you_sent: { type: Boolean, default: false },
    no_show_reengagement_sent: { type: Boolean, default: false },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'test_drives' },
);

TestDriveSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

TestDriveSchema.index({ scheduled_date: 1, status: 1 });
TestDriveSchema.index({ location_id: 1, scheduled_date: 1 });

export const TestDrive = mongoose.models['TestDrive'] as mongoose.Model<ITestDrive> || mongoose.model<ITestDrive>('TestDrive', TestDriveSchema);
