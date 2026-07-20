import { randomUUID } from 'node:crypto';
import { Profile } from '../models/Profile.js';
import { UserRole } from '../models/UserRole.js';

function lean(doc: any) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o._id;
  return o;
}

export async function getProfileByUserId(userId: string) {
  const doc = await Profile.findOne({ user_id: userId }).lean();
  if (!doc) return null;
  const o = { ...doc } as any; delete o._id; return o;
}

export async function getProfileById(id: string) {
  const doc = await Profile.findOne({ id }).lean();
  if (!doc) return null;
  const o = { ...doc } as any; delete o._id; return o;
}

export async function listProfiles(filters: Record<string, unknown> = {}) {
  const q: Record<string, unknown> = {};
  if (filters.location_id) q.location_id = filters.location_id;
  if (filters.location_ids) {
    const ids = String(filters.location_ids).split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) q.location_id = { $in: ids };
  }
  if (typeof filters.is_active === 'boolean') q.is_active = filters.is_active;
  else if (filters.is_active === 'true') q.is_active = true;
  else if (filters.is_active === 'false') q.is_active = false;
  if (filters.ids) {
    const ids = String(filters.ids).split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) q.id = { $in: ids };
  }
  if (filters.user_ids) {
    const ids = String(filters.user_ids).split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) q.user_id = { $in: ids };
  }
  // Filter by role — resolve user_ids from user_roles then scope the profile query
  if (filters.role) {
    const roleStr = String(filters.role);
    const matchingRoles = await UserRole.find({ role: roleStr }, { user_id: 1 }).lean();
    const userIds = matchingRoles.map((r: any) => r.user_id).filter(Boolean);
    if (userIds.length === 0) return [];
    q.user_id = { $in: userIds };
  }
  const docs = await Profile.find(q).sort({ full_name: 1 }).lean();
  return docs.map((d) => { const o = { ...d } as any; delete o._id; return o; });
}

export async function upsertProfile(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const id = String(data.id || randomUUID());
  const doc = await Profile.findOneAndUpdate(
    { user_id: data.user_id },
    { $set: { ...data, id, updated_at: now }, $setOnInsert: { created_at: now } },
    { upsert: true, new: true },
  );
  return lean(doc);
}

export async function updateProfile(id: string, data: Record<string, unknown>) {
  const doc = await Profile.findOneAndUpdate(
    { id },
    { $set: { ...data, updated_at: new Date().toISOString() } },
    { new: true },
  );
  return doc ? lean(doc) : null;
}

export async function setProfileActive(userId: string, is_active: boolean) {
  await Profile.updateOne({ user_id: userId }, { $set: { is_active, updated_at: new Date().toISOString() } });
}

/**
 * Mark a staff member on leave with optional start/end dates.
 * If endDate is supplied, on_leave is derived; otherwise it's set explicitly.
 */
export async function setLeave(
  id: string,
  opts: { startDate: string | null; endDate: string | null; onLeave: boolean },
) {
  const today = new Date().toISOString().split('T')[0];
  // Compute on_leave: true if today falls within [startDate, endDate] or no dates given
  let computedOnLeave = opts.onLeave;
  if (opts.startDate && opts.endDate) {
    computedOnLeave = today >= opts.startDate && today <= opts.endDate;
  } else if (opts.endDate) {
    computedOnLeave = today <= opts.endDate;
  }
  await Profile.updateOne(
    { id },
    {
      $set: {
        on_leave: computedOnLeave,
        leave_start_date: opts.startDate ?? null,
        leave_end_date: opts.endDate ?? null,
        updated_at: new Date().toISOString(),
      },
    },
  );
}

/**
 * Clear on_leave for every profile whose leave_end_date has passed.
 * Returns the count of records updated.
 */
export async function clearExpiredLeaves(): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const result = await Profile.updateMany(
    {
      on_leave: true,
      leave_end_date: { $ne: null, $lt: today },
    },
    {
      $set: {
        on_leave: false,
        leave_start_date: null,
        leave_end_date: null,
        updated_at: new Date().toISOString(),
      },
    },
  );
  return result.modifiedCount ?? 0;
}

export async function touchLastLogin(userId: string) {
  await Profile.updateOne(
    { user_id: userId },
    { $set: { last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() } },
  );
}

export async function deleteProfileByUserId(userId: string) {
  await Profile.deleteOne({ user_id: userId });
}
