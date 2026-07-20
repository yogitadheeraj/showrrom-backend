import { randomUUID } from 'node:crypto';
import { LocationSpecialPeriod } from '../models/LocationSpecialPeriod.js';
import { Location } from '../models/Location.js';
import { Profile } from '../models/Profile.js';
import { UserRole } from '../models/UserRole.js';

type AppUserRole = 'superadmin' | 'super_admin' | 'dealer_admin' | 'gro' | string;

type SpecialPeriodFilters = {
  location_id?: string;
  start_date?: string;
  end_date?: string;
  include_deleted?: boolean;
};

function toPlain(doc: any) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj._id;
  return obj;
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
    locationId: typeof profile.location_id === 'string' ? profile.location_id : null,
    dealerId: typeof profile.dealer_id === 'string' ? profile.dealer_id : null,
  };
}

async function ensureManagePermission(userId: string, locationId: string) {
  const actor = await getActorContext(userId);

  if (actor.role === 'superadmin' || actor.role === 'super_admin') {
    return;
  }

  if (actor.role === 'gro') {
    if (!actor.locationId || actor.locationId !== locationId) {
      throw new Error('Forbidden: GRO can only manage special periods for own location');
    }
    return;
  }

  if (actor.role === 'dealer_admin') {
    const targetLocation = await Location.findOne({ id: locationId }, { dealer_id: 1 }).lean();
    if (!targetLocation?.dealer_id) {
      throw new Error('Location not found');
    }

    let actorDealerId = actor.dealerId;
    if (!actorDealerId && actor.locationId) {
      const actorLocation = await Location.findOne({ id: actor.locationId }, { dealer_id: 1 }).lean();
      actorDealerId = actorLocation?.dealer_id || null;
    }

    if (!actorDealerId || targetLocation.dealer_id !== actorDealerId) {
      throw new Error('Forbidden: Organization Admin can only manage periods for own dealer locations');
    }
    return;
  }

  throw new Error('Forbidden');
}

function validatePeriodData(data: Record<string, unknown>) {
  const startDate = String(data.start_date || '');
  const endDate = String(data.end_date || '');
  if (!startDate || !endDate) {
    throw new Error('start_date and end_date are required');
  }
  if (endDate < startDate) {
    throw new Error('end_date must be on or after start_date');
  }

  const isFullClosure = Boolean(data.is_full_closure);
  const openTime = data.modified_open_time == null ? null : String(data.modified_open_time);
  const closeTime = data.modified_close_time == null ? null : String(data.modified_close_time);

  if (!isFullClosure) {
    if (!openTime || !closeTime) {
      throw new Error('modified_open_time and modified_close_time are required when not full closure');
    }
    if (closeTime <= openTime) {
      throw new Error('modified_close_time must be after modified_open_time');
    }
  }
}

export async function listLocationSpecialPeriods(filters: SpecialPeriodFilters = {}) {
  const query: Record<string, unknown> = {};

  if (filters.location_id) query.location_id = filters.location_id;

  if (!filters.include_deleted) {
    query.is_deleted = { $ne: true };
    query.is_active = { $ne: false };
  }

  if (filters.start_date || filters.end_date) {
    if (filters.start_date && filters.end_date) {
      query.start_date = { $lte: filters.end_date };
      query.end_date = { $gte: filters.start_date };
    } else if (filters.start_date) {
      query.end_date = { $gte: filters.start_date };
    } else if (filters.end_date) {
      query.start_date = { $lte: filters.end_date };
    }
  }

  const docs = await LocationSpecialPeriod.find(query).sort({ start_date: -1, created_at: -1 }).lean();
  return docs.map((d) => {
    const o = { ...d } as any;
    delete o._id;
    return o;
  });
}

export async function getLocationSpecialPeriodById(id: string, includeDeleted = false) {
  const query: Record<string, unknown> = { id };
  if (!includeDeleted) {
    query.is_deleted = { $ne: true };
    query.is_active = { $ne: false };
  }

  const doc = await LocationSpecialPeriod.findOne(query).lean();
  if (!doc) return null;
  const o = { ...doc } as any;
  delete o._id;
  return o;
}

export async function createLocationSpecialPeriod(userId: string, data: Record<string, unknown>) {
  const locationId = String(data.location_id || '');
  if (!locationId) {
    throw new Error('location_id is required');
  }

  validatePeriodData(data);
  await ensureManagePermission(userId, locationId);

  const now = new Date().toISOString();
  const doc = new LocationSpecialPeriod({
    ...data,
    id: typeof data.id === 'string' && data.id ? data.id : randomUUID(),
    is_active: true,
    is_deleted: false,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  });

  await doc.save();
  return toPlain(doc);
}

export async function updateLocationSpecialPeriod(userId: string, id: string, data: Record<string, unknown>) {
  const existing = await LocationSpecialPeriod.findOne({ id, is_deleted: { $ne: true } }).lean();
  if (!existing) return null;

  await ensureManagePermission(userId, existing.location_id);

  const merged: Record<string, unknown> = {
    ...existing,
    ...data,
  };

  validatePeriodData(merged);

  const doc = await LocationSpecialPeriod.findOneAndUpdate(
    { id, is_deleted: { $ne: true } },
    { $set: { ...data, updated_at: new Date().toISOString() } },
    { new: true },
  );

  if (!doc) return null;
  return toPlain(doc);
}

export async function deleteLocationSpecialPeriod(userId: string, id: string) {
  const existing = await LocationSpecialPeriod.findOne({ id, is_deleted: { $ne: true } }).lean();
  if (!existing) return null;

  await ensureManagePermission(userId, existing.location_id);

  const now = new Date().toISOString();
  const doc = await LocationSpecialPeriod.findOneAndUpdate(
    { id, is_deleted: { $ne: true } },
    { $set: { is_active: false, is_deleted: true, deleted_at: now, updated_at: now } },
    { new: true },
  );

  return doc ? toPlain(doc) : null;
}
