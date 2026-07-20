import { randomUUID } from 'node:crypto';
import { StaffActivityEvent } from '../models/StaffActivityEvent.js';
import { StaffActivitySession } from '../models/StaffActivitySession.js';

function lean(doc: any) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o._id;
  return o;
}

// ── Events ────────────────────────────────────────────────────────────────────

export async function logEvent(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const doc = new StaffActivityEvent({
    ...data,
    id: String(data.id || randomUUID()),
    happened_at: String(data.happened_at || now),
    created_at: now,
  });
  await doc.save();
  return lean(doc);
}

export async function listEvents(filters: Record<string, unknown> = {}, limit = 200) {
  const q: Record<string, unknown> = {};
  if (filters.user_id) q.user_id = filters.user_id;
  if (filters.profile_id) q.profile_id = filters.profile_id;
  if (filters.location_ids && Array.isArray(filters.location_ids) && filters.location_ids.length > 0) {
    q.location_id = { $in: filters.location_ids };
  } else if (filters.location_id) {
    q.location_id = filters.location_id;
  }
  if (filters.session_id) q.session_id = filters.session_id;
  if (filters.event_type) q.event_type = filters.event_type;
  if (filters.role) q.role = filters.role;
  if (filters.event_types) {
    const types = String(filters.event_types).split(',').map((s) => s.trim()).filter(Boolean);
    if (types.length > 0) q.event_type = { $in: types };
  }
  const docs = await StaffActivityEvent.find(q).sort({ happened_at: -1 }).limit(limit).lean();
  return docs.map((d) => { const o = { ...d } as any; delete o._id; return o; });
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function startSession(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const doc = new StaffActivitySession({
    ...data,
    id: String(data.id || randomUUID()),
    login_at: now,
    last_seen_at: now,
    is_online: true,
    active_seconds: 0,
    idle_seconds: 0,
    created_at: now,
  });
  await doc.save();
  return lean(doc);
}

export async function touchSession(id: string, activeSeconds: number, idleSeconds: number) {
  await StaffActivitySession.updateOne(
    { id },
    { $set: { last_seen_at: new Date().toISOString(), is_online: true }, $inc: { active_seconds: activeSeconds, idle_seconds: idleSeconds } },
  );
}

export async function endSession(id: string) {
  await StaffActivitySession.updateOne(
    { id },
    { $set: { logout_at: new Date().toISOString(), is_online: false } },
  );
}

export async function getActiveSessionByUserId(userId: string) {
  const doc = await StaffActivitySession.findOne({ user_id: userId, is_online: true }).sort({ login_at: -1 }).lean();
  if (!doc) return null;
  const o = { ...doc } as any; delete o._id; return o;
}

export async function listOnlineSessions(locationId?: string, locationIds?: string[]) {
  const q: Record<string, unknown> = { is_online: true };
  if (locationIds && locationIds.length > 0) {
    q.location_id = { $in: locationIds };
  } else if (locationId) {
    q.location_id = locationId;
  }
  const docs = await StaffActivitySession.find(q).sort({ last_seen_at: -1 }).lean();
  return docs.map((d) => { const o = { ...d } as any; delete o._id; return o; });
}
