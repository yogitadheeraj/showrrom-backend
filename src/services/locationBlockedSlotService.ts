import { randomUUID } from 'node:crypto';
import { LocationBlockedSlot } from '../models/LocationBlockedSlot.js';
import { TestDrive } from '../models/TestDrive.js';
import { Location } from '../models/Location.js';
import { Profile } from '../models/Profile.js';
import { UserRole } from '../models/UserRole.js';

type AppUserRole =
  | 'superadmin'
  | 'super_admin'
  | 'dealer_admin'
  | 'sales_admin'
  | 'gro'
  | 'sales'
  | 'security'
  | string;

function lean(doc: any) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o._id;
  return o;
}

async function getActorContext(userId: string) {
  const [roleDoc, profileDoc] = await Promise.all([
    UserRole.findOne({ user_id: userId }, { role: 1 }).lean(),
    Profile.findOne({ user_id: userId }).lean(),
  ]);

  const role = (roleDoc?.role || '') as AppUserRole;
  const profile = (profileDoc || {}) as Record<string, unknown>;

  return {
    role,
    profileId: typeof profile.id === 'string' ? profile.id : null,
    locationId: typeof profile.location_id === 'string' ? profile.location_id : null,
    dealerId: typeof profile.dealer_id === 'string' ? profile.dealer_id : null,
  };
}

async function ensureManagePermission(userId: string, locationId: string) {
  const actor = await getActorContext(userId);

  if (actor.role === 'superadmin' || actor.role === 'super_admin') {
    return actor;
  }

  // GRO and sales_admin can manage their own location only
  if (actor.role === 'gro' || actor.role === 'sales_admin') {
    if (!actor.locationId || actor.locationId !== locationId) {
      throw new Error('Forbidden: can only manage blocked slots for own location');
    }
    return actor;
  }

  // dealer_admin can manage any location within their dealer
  if (actor.role === 'dealer_admin') {
    const targetLoc = await Location.findOne({ id: locationId }, { dealer_id: 1 }).lean();
    if (!targetLoc?.dealer_id) throw new Error('Location not found');

    let actorDealerId = actor.dealerId;
    if (!actorDealerId && actor.locationId) {
      const actorLoc = await Location.findOne({ id: actor.locationId }, { dealer_id: 1 }).lean();
      actorDealerId = actorLoc?.dealer_id || null;
    }
    if (!actorDealerId || targetLoc.dealer_id !== actorDealerId) {
      throw new Error('Forbidden: Organization Admin can only manage slots for own dealer locations');
    }
    return actor;
  }

  throw new Error('Forbidden: insufficient role to manage blocked slots');
}

// ── Queries ──────────────────────────────────────────────────────────────────

export type BlockedSlotFilters = {
  location_id?: string;
  blocked_date?: string;
  from_date?: string;
  to_date?: string;
};

export async function listBlockedSlots(filters: BlockedSlotFilters = {}) {
  const query: Record<string, unknown> = {};

  if (filters.location_id) query.location_id = filters.location_id;

  if (filters.blocked_date) {
    query.blocked_date = filters.blocked_date;
  } else if (filters.from_date || filters.to_date) {
    const range: Record<string, string> = {};
    if (filters.from_date) range.$gte = filters.from_date;
    if (filters.to_date) range.$lte = filters.to_date;
    query.blocked_date = range;
  }

  const docs = await LocationBlockedSlot.find(query)
    .sort({ blocked_date: 1, start_time: 1 })
    .lean();

  return docs.map((d) => {
    const o = { ...d } as any;
    delete o._id;
    return o;
  });
}

export async function getBlockedSlotById(id: string) {
  const doc = await LocationBlockedSlot.findOne({ id }).lean();
  if (!doc) return null;
  const o = { ...doc } as any;
  delete o._id;
  return o;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createBlockedSlot(userId: string, data: Record<string, unknown>) {
  const locationId = String(data.location_id || '');
  if (!locationId) throw new Error('location_id is required');

  const blockedDate = String(data.blocked_date || '');
  if (!blockedDate || !/^\d{4}-\d{2}-\d{2}$/.test(blockedDate)) {
    throw new Error('blocked_date is required (YYYY-MM-DD)');
  }

  const startTime = String(data.start_time || '').substring(0, 5);
  const endTime = String(data.end_time || '').substring(0, 5);

  if (!startTime || !endTime) throw new Error('start_time and end_time are required (HH:MM)');
  if (endTime <= startTime) throw new Error('end_time must be after start_time');

  const actor = await ensureManagePermission(userId, locationId);

  const doc = new LocationBlockedSlot({
    id: randomUUID(),
    location_id: locationId,
    blocked_date: blockedDate,
    start_time: startTime,
    end_time: endTime,
    reason: data.reason ? String(data.reason).trim() || null : null,
    block_source: String(data.block_source || 'manual'),
    created_by_profile_id: actor.profileId,
    created_at: new Date().toISOString(),
  });

  await doc.save();

  // Detect existing active test drives that fall inside this blocked window
  const conflicting = await TestDrive.find({
    location_id: locationId,
    scheduled_date: blockedDate,
    status: { $in: ['scheduled', 'confirmed', 'show', 'in_progress'] },
  }, { id: 1, scheduled_time: 1, slot_duration_minutes: 1, status: 1, customer_id: 1 }).lean();

  const affected = conflicting.filter((td) => {
    const time = String(td.scheduled_time || '').substring(0, 5);
    if (!time) return false;
    const [h, m] = time.split(':').map(Number);
    const tdStart = h * 60 + m;
    const tdEnd = tdStart + (Number(td.slot_duration_minutes) || 30);
    const [bsh, bsm] = startTime.split(':').map(Number);
    const [beh, bem] = endTime.split(':').map(Number);
    const bStart = bsh * 60 + bsm;
    const bEnd = beh * 60 + bem;
    return !(tdEnd <= bStart || tdStart >= bEnd);
  }).map((td) => {
    const o = { ...td } as any;
    delete o._id;
    return o;
  });

  return { ...lean(doc), affected_bookings: affected };
}

export async function deleteBlockedSlot(userId: string, id: string) {
  const existing = await LocationBlockedSlot.findOne({ id }).lean();
  if (!existing) return null;

  await ensureManagePermission(userId, String(existing.location_id));

  await LocationBlockedSlot.deleteOne({ id });

  const o = { ...existing } as any;
  delete o._id;
  return o;
}

/**
 * Check if a given time range on a date is blocked for a location.
 * Used by the slot availability engine to enforce blocked windows.
 */
export async function isTimeRangeBlocked(
  locationId: string,
  date: string,
  slotStartTime: string,
  slotEndTime: string,
): Promise<boolean> {
  // Find any blocked slot that overlaps the requested window
  const count = await LocationBlockedSlot.countDocuments({
    location_id: locationId,
    blocked_date: date,
    start_time: { $lt: slotEndTime },
    end_time: { $gt: slotStartTime },
  });

  return count > 0;
}

/**
 * Cancel all active test drives that overlap with a blocked slot.
 * Called explicitly by an admin — this is a destructive action.
 * Returns the list of cancelled test drive ids.
 */
export async function cancelConflictingBookings(
  userId: string,
  blockedSlotId: string,
  reason?: string,
): Promise<{ cancelled: string[] }> {
  const slot = await LocationBlockedSlot.findOne({ id: blockedSlotId }).lean();
  if (!slot) throw new Error('Blocked slot not found');

  await ensureManagePermission(userId, String(slot.location_id));

  const startTime = String(slot.start_time).substring(0, 5);
  const endTime = String(slot.end_time).substring(0, 5);
  const [bsh, bsm] = startTime.split(':').map(Number);
  const [beh, bem] = endTime.split(':').map(Number);
  const bStart = bsh * 60 + bsm;
  const bEnd = beh * 60 + bem;

  const active = await TestDrive.find({
    location_id: slot.location_id,
    scheduled_date: slot.blocked_date,
    status: { $in: ['scheduled', 'confirmed', 'show', 'in_progress'] },
  }, { id: 1, scheduled_time: 1, slot_duration_minutes: 1 }).lean();

  const toCancel = active.filter((td) => {
    const time = String(td.scheduled_time || '').substring(0, 5);
    if (!time) return false;
    const [h, m] = time.split(':').map(Number);
    const tdStart = h * 60 + m;
    const tdEnd = tdStart + (Number(td.slot_duration_minutes) || 30);
    return !(tdEnd <= bStart || tdStart >= bEnd);
  });

  if (toCancel.length === 0) return { cancelled: [] };

  const cancelReason = reason?.trim() || `Slot blocked: ${startTime}–${endTime} on ${slot.blocked_date}`;
  const now = new Date().toISOString();

  await TestDrive.updateMany(
    { id: { $in: toCancel.map((td) => td.id) } },
    {
      $set: {
        status: 'cancelled',
        cancelled_reason: cancelReason,
        cancellation_reason: cancelReason,
        updated_at: now,
      },
    },
  );

  return { cancelled: toCancel.map((td) => String(td.id)) };
}
