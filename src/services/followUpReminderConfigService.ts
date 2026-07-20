import { randomUUID } from 'node:crypto';
import { FollowUpReminderConfig } from '../models/FollowUpReminderConfig.js';
import { Location } from '../models/Location.js';
import { Profile } from '../models/Profile.js';
import { UserRole } from '../models/UserRole.js';

type AppUserRole = 'superadmin' | 'super_admin' | 'dealer_admin' | 'sales_admin' | 'gro' | 'sales' | 'security' | string;

const ALLOWED_ROLES: AppUserRole[] = ['superadmin', 'super_admin', 'dealer_admin', 'sales_admin'];

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

async function resolveActorDealerId(actor: Awaited<ReturnType<typeof getActorContext>>) {
  if (actor.dealerId) return actor.dealerId;
  if (actor.locationId) {
    const loc = await Location.findOne({ id: actor.locationId }, { dealer_id: 1 }).lean();
    return loc?.dealer_id || null;
  }
  return null;
}

async function ensureManagePermission(userId: string, locationId: string) {
  const actor = await getActorContext(userId);

  if (actor.role === 'superadmin' || actor.role === 'super_admin') {
    return actor;
  }

  if (!ALLOWED_ROLES.includes(actor.role)) {
    throw new Error('Forbidden: insufficient role to manage follow-up reminder config');
  }

  // sales_admin and gro can only manage their own location
  if (actor.role === 'sales_admin') {
    if (!actor.locationId || actor.locationId !== locationId) {
      throw new Error('Forbidden: Branch Admin can only manage config for own location');
    }
    return actor;
  }

  // dealer_admin can manage any location within their dealer
  if (actor.role === 'dealer_admin') {
    const targetLocation = await Location.findOne({ id: locationId }, { dealer_id: 1 }).lean();
    if (!targetLocation?.dealer_id) throw new Error('Location not found');

    const actorDealerId = await resolveActorDealerId(actor);
    if (!actorDealerId || targetLocation.dealer_id !== actorDealerId) {
      throw new Error('Forbidden: Organization Admin can only manage config for own dealer locations');
    }
    return actor;
  }

  throw new Error('Forbidden');
}

export async function getConfigByLocationId(locationId: string) {
  const doc = await FollowUpReminderConfig.findOne({ location_id: locationId }).lean();
  if (!doc) return null;
  const o = { ...doc } as any;
  delete o._id;
  return o;
}

export async function listConfigs(filters: { dealer_id?: string; location_id?: string } = {}) {
  const query: Record<string, unknown> = {};
  if (filters.location_id) query.location_id = filters.location_id;
  if (filters.dealer_id) query.dealer_id = filters.dealer_id;

  const docs = await FollowUpReminderConfig.find(query).sort({ updated_at: -1 }).lean();
  return docs.map((d) => {
    const o = { ...d } as any;
    delete o._id;
    return o;
  });
}

export async function upsertConfig(userId: string, data: Record<string, unknown>) {
  const locationId = String(data.location_id || '');
  if (!locationId) throw new Error('location_id is required');

  const actor = await ensureManagePermission(userId, locationId);

  // Resolve dealer_id from location if not provided
  let dealerId = data.dealer_id ? String(data.dealer_id) : null;
  if (!dealerId) {
    const loc = await Location.findOne({ id: locationId }, { dealer_id: 1 }).lean();
    dealerId = loc?.dealer_id || null;
  }

  const reminderBefore = Math.max(1, Math.min(120, Number(data.reminder_before_minutes) || 30));

  const existing = await FollowUpReminderConfig.findOne({ location_id: locationId });

  if (existing) {
    const updates: Record<string, unknown> = {
      dealer_id: dealerId ?? existing.dealer_id,
      reminder_enabled: typeof data.reminder_enabled === 'boolean' ? data.reminder_enabled : existing.reminder_enabled,
      reminder_before_minutes: reminderBefore,
      reminder_message: data.reminder_message
        ? String(data.reminder_message).trim() || existing.reminder_message
        : existing.reminder_message,
      tone_type: data.tone_type ? String(data.tone_type) : existing.tone_type,
      notify_due_list: typeof data.notify_due_list === 'boolean' ? data.notify_due_list : existing.notify_due_list,
      updated_by_profile_id: actor.profileId ?? existing.updated_by_profile_id,
      updated_at: new Date().toISOString(),
    };

    const updated = await FollowUpReminderConfig.findOneAndUpdate(
      { location_id: locationId },
      { $set: updates },
      { new: true },
    );

    return updated ? lean(updated) : null;
  }

  // Create new
  const now = new Date().toISOString();
  const doc = new FollowUpReminderConfig({
    id: randomUUID(),
    location_id: locationId,
    dealer_id: dealerId,
    reminder_enabled: typeof data.reminder_enabled === 'boolean' ? data.reminder_enabled : true,
    reminder_before_minutes: reminderBefore,
    reminder_message: data.reminder_message
      ? String(data.reminder_message).trim() || 'Follow-up due soon: {{title}} at {{dueAt}}'
      : 'Follow-up due soon: {{title}} at {{dueAt}}',
    tone_type: data.tone_type ? String(data.tone_type) : 'classic',
    notify_due_list: typeof data.notify_due_list === 'boolean' ? data.notify_due_list : true,
    updated_by_profile_id: actor.profileId,
    created_at: now,
    updated_at: now,
  });

  await doc.save();
  return lean(doc);
}

export async function deleteConfig(userId: string, locationId: string) {
  await ensureManagePermission(userId, locationId);

  const doc = await FollowUpReminderConfig.findOneAndDelete({ location_id: locationId });
  if (!doc) return null;
  return lean(doc);
}
