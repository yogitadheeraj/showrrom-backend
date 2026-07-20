import { randomUUID } from 'node:crypto';
import { LocationOperatingHour } from '../models/LocationOperatingHour.js';
import { Location } from '../models/Location.js';
import { Profile } from '../models/Profile.js';
import { UserRole } from '../models/UserRole.js';

type AppUserRole = 'superadmin' | 'super_admin' | 'dealer_admin' | 'gro' | string;

type OperatingHoursFilters = {
  location_id?: string;
  location_ids?: string[];
  day_of_week?: number;
};

type OperatingHourInput = {
  id?: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
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
      throw new Error('Forbidden: GRO can only manage operating hours for own location');
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
      throw new Error('Forbidden: Organization Admin can only manage hours for own dealer locations');
    }
    return;
  }

  throw new Error('Forbidden');
}

function validateHourRecord(record: OperatingHourInput) {
  if (!Number.isInteger(record.day_of_week) || record.day_of_week < 0 || record.day_of_week > 6) {
    throw new Error('day_of_week must be an integer between 0 and 6');
  }

  if (!record.is_closed) {
    if (!record.open_time || !record.close_time) {
      throw new Error('open_time and close_time are required when day is not closed');
    }

    if (record.close_time <= record.open_time) {
      throw new Error('close_time must be after open_time');
    }
  }
}

export async function listLocationOperatingHours(filters: OperatingHoursFilters = {}) {
  const query: Record<string, unknown> = {};

  if (filters.location_id) {
    query.location_id = filters.location_id;
  } else if (filters.location_ids && filters.location_ids.length > 0) {
    query.location_id = { $in: filters.location_ids };
  }

  if (typeof filters.day_of_week === 'number') {
    query.day_of_week = filters.day_of_week;
  }

  const docs = await LocationOperatingHour.find(query).sort({ location_id: 1, day_of_week: 1 }).lean();
  return docs.map((d) => {
    const o = { ...d } as any;
    delete o._id;
    return o;
  });
}

export async function getLocationOperatingHourById(id: string) {
  const doc = await LocationOperatingHour.findOne({ id }).lean();
  if (!doc) return null;
  const o = { ...doc } as any;
  delete o._id;
  return o;
}

export async function createLocationOperatingHour(userId: string, data: Record<string, unknown>) {
  const locationId = String(data.location_id || '');
  if (!locationId) {
    throw new Error('location_id is required');
  }

  await ensureManagePermission(userId, locationId);

  const row: OperatingHourInput = {
    day_of_week: Number(data.day_of_week),
    open_time: String(data.open_time || '09:00'),
    close_time: String(data.close_time || '19:00'),
    is_closed: Boolean(data.is_closed),
  };
  validateHourRecord(row);

  const now = new Date().toISOString();
  const doc = new LocationOperatingHour({
    ...row,
    id: typeof data.id === 'string' && data.id ? data.id : randomUUID(),
    location_id: locationId,
    created_at: now,
    updated_at: now,
  });

  await doc.save();
  return toPlain(doc);
}

export async function updateLocationOperatingHour(userId: string, id: string, data: Record<string, unknown>) {
  const existing = await LocationOperatingHour.findOne({ id }).lean();
  if (!existing) return null;

  await ensureManagePermission(userId, existing.location_id);

  const merged: OperatingHourInput = {
    day_of_week: Number(data.day_of_week ?? existing.day_of_week),
    open_time: String(data.open_time ?? existing.open_time ?? '09:00'),
    close_time: String(data.close_time ?? existing.close_time ?? '19:00'),
    is_closed: Boolean(data.is_closed ?? existing.is_closed),
  };
  validateHourRecord(merged);

  const doc = await LocationOperatingHour.findOneAndUpdate(
    { id },
    { $set: { ...data, updated_at: new Date().toISOString() } },
    { new: true },
  );

  return doc ? toPlain(doc) : null;
}

export async function deleteLocationOperatingHour(userId: string, id: string) {
  const existing = await LocationOperatingHour.findOne({ id }).lean();
  if (!existing) return null;

  await ensureManagePermission(userId, existing.location_id);
  await LocationOperatingHour.deleteOne({ id });
  return { id };
}

export async function bulkUpsertLocationOperatingHours(
  userId: string,
  locationId: string,
  rows: OperatingHourInput[],
) {
  if (!locationId) {
    throw new Error('location_id is required');
  }

  await ensureManagePermission(userId, locationId);

  const now = new Date().toISOString();

  for (const row of rows) {
    validateHourRecord(row);

    if (row.id) {
      await LocationOperatingHour.findOneAndUpdate(
        { id: row.id, location_id: locationId },
        {
          $set: {
            day_of_week: row.day_of_week,
            open_time: row.open_time,
            close_time: row.close_time,
            is_closed: row.is_closed,
            updated_at: now,
          },
        },
        { new: true },
      );
      continue;
    }

    const existingByDay = await LocationOperatingHour.findOne({
      location_id: locationId,
      day_of_week: row.day_of_week,
    }).lean();

    if (existingByDay?.id) {
      await LocationOperatingHour.findOneAndUpdate(
        { id: existingByDay.id },
        {
          $set: {
            open_time: row.open_time,
            close_time: row.close_time,
            is_closed: row.is_closed,
            updated_at: now,
          },
        },
        { new: true },
      );
    } else {
      await new LocationOperatingHour({
        id: randomUUID(),
        location_id: locationId,
        day_of_week: row.day_of_week,
        open_time: row.open_time,
        close_time: row.close_time,
        is_closed: row.is_closed,
        created_at: now,
        updated_at: now,
      }).save();
    }
  }

  return listLocationOperatingHours({ location_id: locationId });
}
