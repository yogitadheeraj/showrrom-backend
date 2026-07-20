import mongoose, { Document, Schema } from 'mongoose';

/**
 * LocationBlockedSlot — fine-grained intra-day time blocks for a specific date.
 *
 * Relationship with the other slot/schedule tables:
 *   - location_operating_hours  : weekly recurring schedule (Mon-Sun open/close times)
 *   - location_special_periods  : date-range overrides (e.g. holidays, full closures,
 *                                  modified hours for a multi-day period)
 *   - location_blocked_slots    : precise time windows on a specific date that are
 *                                  unavailable for test-drive bookings even though the
 *                                  showroom is otherwise open that day
 *                                  (e.g. "10:00–11:00 for a staff meeting on June 15")
 *
 * Use blocked slots when you need sub-day granularity without touching the day's
 * overall schedule.  Use special periods for day-level or multi-day closures/changes.
 */

export type BlockSource = 'manual' | 'special_period' | 'system';

export interface ILocationBlockedSlot extends Document {
  id: string;
  location_id: string;
  blocked_date: string;   // YYYY-MM-DD
  start_time: string;     // HH:MM
  end_time: string;       // HH:MM
  reason: string | null;
  block_source: BlockSource;
  created_by_profile_id: string | null;
  created_at: string;
}

const LocationBlockedSlotSchema = new Schema<ILocationBlockedSlot>(
  {
    id: { type: String, required: true, unique: true, index: true },
    location_id: { type: String, required: true, index: true },
    blocked_date: { type: String, required: true, index: true },
    start_time: { type: String, required: true },
    end_time: { type: String, required: true },
    reason: { type: String, default: null },
    block_source: {
      type: String,
      enum: ['manual', 'special_period', 'system'],
      default: 'manual',
    },
    created_by_profile_id: { type: String, default: null },
    created_at: { type: String, default: () => new Date().toISOString() },
  },
  { versionKey: false, collection: 'location_blocked_slots' },
);

LocationBlockedSlotSchema.index({ location_id: 1, blocked_date: 1 });

export const LocationBlockedSlot =
  (mongoose.models['LocationBlockedSlot'] as mongoose.Model<ILocationBlockedSlot>) ||
  mongoose.model<ILocationBlockedSlot>('LocationBlockedSlot', LocationBlockedSlotSchema);
