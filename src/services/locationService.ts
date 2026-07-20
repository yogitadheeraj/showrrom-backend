import { randomUUID } from 'node:crypto';
import { Location } from '../models/Location.js';

function toPlain(doc: any) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj._id;
  return obj;
}

export async function listLocations(filters: Record<string, unknown> = {}) {
  const query: Record<string, unknown> = {};
  if (filters.dealer_id) query.dealer_id = filters.dealer_id;
  if (filters.brandId) query.brandId = filters.brandId;
  if (filters.businessUnitId) query.businessUnitId = filters.businessUnitId;
  if (filters.salesOfficeId) query.salesOfficeId = filters.salesOfficeId;
  if (filters.plantId) query.plantId = filters.plantId;
  if (typeof filters.is_active === 'boolean') query.is_active = filters.is_active;
  else if (filters.is_active === 'true') query.is_active = true;
  else if (filters.is_active === 'false') query.is_active = false;
  if (filters.location_id) {
    // location_id used by location-scoped roles to restrict to their own location
    query.id = filters.location_id;
  } else if (filters.ids) {
    const ids = String(filters.ids).split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) query.id = { $in: ids };
  }
  const docs = await Location.find(query).sort({ name: 1 }).lean();
  return docs.map((d) => { const o = { ...d } as any; delete o._id; return o; });
}

export async function getLocationById(id: string) {
  const doc = await Location.findOne({ id }).lean();
  if (!doc) return null;
  const o = { ...doc } as any; delete o._id; return o;
}

export async function createLocation(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const doc = new Location({
    ...data,
    id: typeof data.id === 'string' && data.id ? data.id : randomUUID(),
    created_at: now,
    updated_at: now,
  });
  await doc.save();
  return toPlain(doc);
}

export async function updateLocation(id: string, data: Record<string, unknown>) {
  const doc = await Location.findOneAndUpdate(
    { id },
    { $set: { ...data, updated_at: new Date().toISOString() } },
    { new: true },
  );
  if (!doc) return null;
  return toPlain(doc);
}

export async function deleteLocation(id: string) {
  await Location.deleteOne({ id });
}
