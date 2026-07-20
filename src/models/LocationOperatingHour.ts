import mongoose, { Document, Schema } from 'mongoose';

export interface ILocationOperatingHour extends Document {
  id: string;
  location_id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
}

const LocationOperatingHourSchema = new Schema<ILocationOperatingHour>(
  {
    id: { type: String, required: true, unique: true, index: true },
    location_id: { type: String, required: true, index: true },
    day_of_week: { type: Number, required: true, min: 0, max: 6, index: true },
    open_time: { type: String, default: '09:00' },
    close_time: { type: String, default: '19:00' },
    is_closed: { type: Boolean, default: false },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'location_operating_hours' },
);

LocationOperatingHourSchema.pre('save', function (next) {
  this.updated_at = new Date().toISOString();
  next();
});

LocationOperatingHourSchema.index({ location_id: 1, day_of_week: 1 }, { unique: true });

export const LocationOperatingHour =
  (mongoose.models['LocationOperatingHour'] as mongoose.Model<ILocationOperatingHour>) ||
  mongoose.model<ILocationOperatingHour>('LocationOperatingHour', LocationOperatingHourSchema);
