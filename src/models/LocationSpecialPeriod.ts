import mongoose, { Document, Schema } from 'mongoose';

export interface ILocationSpecialPeriod extends Document {
  id: string;
  location_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_full_closure: boolean;
  modified_open_time: string | null;
  modified_close_time: string | null;
  notes: string | null;
  is_active: boolean;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

const LocationSpecialPeriodSchema = new Schema<ILocationSpecialPeriod>(
  {
    id: { type: String, required: true, unique: true, index: true },
    location_id: { type: String, required: true, index: true },
    name: { type: String, required: true },
    start_date: { type: String, required: true, index: true },
    end_date: { type: String, required: true, index: true },
    is_full_closure: { type: Boolean, default: false },
    modified_open_time: { type: String, default: null },
    modified_close_time: { type: String, default: null },
    notes: { type: String, default: null },
    is_active: { type: Boolean, default: true, index: true },
    is_deleted: { type: Boolean, default: false, index: true },
    deleted_at: { type: String, default: null },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'location_special_periods' },
);

LocationSpecialPeriodSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

LocationSpecialPeriodSchema.index({ location_id: 1, start_date: 1, end_date: 1 });

export const LocationSpecialPeriod =
  (mongoose.models['LocationSpecialPeriod'] as mongoose.Model<ILocationSpecialPeriod>) ||
  mongoose.model<ILocationSpecialPeriod>('LocationSpecialPeriod', LocationSpecialPeriodSchema);
