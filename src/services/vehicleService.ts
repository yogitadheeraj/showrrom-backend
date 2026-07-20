import { randomUUID } from 'node:crypto';
import { Vehicle } from '../models/Vehicle.js';
import { VehicleTransit } from '../models/VehicleTransit.js';
import { TestDrive } from '../models/TestDrive.js';
import { Location } from '../models/Location.js';
import { getVehicleAvailabilityAtLocation, osrmRoute } from './vehicleFleetService.js';

function lean(doc: any) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o._id;
  return o;
}

export async function listVehicles(filters: Record<string, unknown> = {}) {
  const q: Record<string, unknown> = {};
  if (filters.location_ids && Array.isArray(filters.location_ids) && filters.location_ids.length > 0) {
    q.location_id = { $in: filters.location_ids };
  } else if (filters.location_id) {
    q.location_id = filters.location_id;
  }
  if (typeof filters.is_active === 'boolean') q.is_active = filters.is_active;
  if (typeof filters.is_available === 'boolean') q.is_available = filters.is_available;
  if (filters.brand) q.brand = filters.brand;
  if (filters.model) q.model = filters.model;
  if (filters.ids) {
    const ids = String(filters.ids).split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) q.id = { $in: ids };
  }
  const docs = await Vehicle.find(q).sort({ brand: 1, model: 1 }).lean();
  return docs.map((d) => { const o = { ...d } as any; delete o._id; return o; });
}

export async function getVehicleById(id: string) {
  const doc = await Vehicle.findOne({ id }).lean();
  if (!doc) return null;
  const o = { ...doc } as any; delete o._id; return o;
}

function normalizeVehiclePayload(data: Record<string, unknown>) {
  const payload = { ...data } as Record<string, unknown>;

  if ('vin' in payload) {
    const vin = typeof payload.vin === 'string' ? payload.vin.trim() : payload.vin;
    if (vin) {
      payload.vin = vin;
    } else {
      delete payload.vin;
    }
  }

  if ('stockNumber' in payload) {
    const stockNumber = typeof payload.stockNumber === 'string' ? payload.stockNumber.trim() : payload.stockNumber;
    if (stockNumber) {
      payload.stockNumber = stockNumber;
    } else {
      delete payload.stockNumber;
    }
  }

  return payload;
}

export async function createVehicle(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const payload = normalizeVehiclePayload(data);
  const doc = new Vehicle({ ...payload, id: String(payload.id || randomUUID()), created_at: now, updated_at: now });
  await doc.save();
  return lean(doc);
}

export async function updateVehicle(id: string, data: Record<string, unknown>) {
  const payload = normalizeVehiclePayload(data);
  const doc = await Vehicle.findOneAndUpdate(
    { id },
    { $set: { ...payload, updated_at: new Date().toISOString() } },
    { new: true },
  );
  return doc ? lean(doc) : null;
}

export async function deleteVehicle(id: string) {
  await Vehicle.deleteOne({ id });
}

export async function bulkInsertVehicles(records: Record<string, unknown>[]) {
  const now = new Date().toISOString();
  const docs = records.map((r) => ({ ...r, id: String(r.id || randomUUID()), created_at: now, updated_at: now }));
  return Vehicle.insertMany(docs, { ordered: false });
}

/**
 * Get all vehicles available for booking at a given location on a given date/time.
 *
 * Returns two groups:
 *  - `local`  — vehicles homed at this location (is_demo = true, is_available = true)
 *  - `shared` — is_shared vehicles from other locations that are either:
 *      a) already at this location (current_location_id = locationId), OR
 *      b) will arrive before the requested time (eta_time < requested_datetime)
 *      AND have no conflicting test drive slot
 *
 * Each shared vehicle includes:
 *  - `is_shared: true`
 *  - `transit_minutes: number | null`   — travel time from current location
 *  - `distance_km: number | null`
 *  - `available_from: string`           — earliest ISO time it can start here
 *  - `vehicle_state: string`            — 'at_location' | 'in_transit' | 'at_other_location'
 */
export async function getAvailableVehiclesForBooking(
  locationId: string,
  date?: string,        // YYYY-MM-DD — optional; if omitted, no slot conflict checks run
  time?: string,        // HH:MM — if provided, check if vehicle is free at that slot
) {
  // Use today as a fallback date for availability queries if none provided
  const effectiveDate = date || new Date().toISOString().split('T')[0];

  // ── Local demo vehicles at this location ──────────────────────────────────
  // Note: is_available is intentionally NOT checked here — slot conflict detection
  // already handles true availability. is_available is used for permanent deactivation,
  // not temporal slot-based availability.
  const localVehicles = await Vehicle.find({
    location_id: locationId,
    is_demo: true,
    is_active: true,
  }).lean();

  // Check each local vehicle for slot conflicts (only when date is explicitly provided)
  const requestedMinutes = time ? timeToMinutes(time) : null;
  const localWithAvailability = await Promise.all(localVehicles.map(async (v: any) => {
    const slotInfo = await getVehicleAvailabilityAtLocation(v.id, locationId, effectiveDate);
    const conflicting = date && requestedMinutes !== null
      ? await hasSlotConflict(v.id, effectiveDate, requestedMinutes, 30)
      : false;
    return {
      ...v,
      _id: undefined,
      is_local: true,
      is_shared: false,
      available_from: slotInfo.availableFrom,
      vehicle_state: conflicting ? 'booked' : slotInfo.vehicleState,
      transit_minutes: null,
      distance_km: null,
      has_conflict: conflicting,
    };
  }));

  // ── Shared vehicles available for this location ───────────────────────────
  // shared_location_ids = [] means all locations; non-empty means only those IDs
  const sharedVehicles = await Vehicle.find({
    is_shared: true,
    is_active: true,
    $or: [
      { shared_location_ids: { $exists: false } },
      { shared_location_ids: { $size: 0 } },
      { shared_location_ids: locationId },
    ],
  }).lean();

  const sharedWithAvailability = await Promise.all(sharedVehicles.map(async (v: any) => {
    const slotInfo = await getVehicleAvailabilityAtLocation(v.id, locationId, effectiveDate);
    const conflicting = date && requestedMinutes !== null
      ? await hasSlotConflict(v.id, effectiveDate, requestedMinutes, 30)
      : false;

    // Enrich with home location name
    const effectiveLoc = v.current_location_id || v.location_id;
    const currentLoc = await Location.findOne({ id: effectiveLoc }, { name: 1, city: 1 }).lean();

    return {
      ...v,
      _id: undefined,
      is_local: v.location_id === locationId || v.current_location_id === locationId,
      current_location_name: currentLoc ? `${currentLoc.name}${currentLoc.city ? `, ${currentLoc.city}` : ''}` : null,
      available_from: slotInfo.availableFrom,
      vehicle_state: conflicting ? 'booked' : slotInfo.vehicleState,
      transit_minutes: slotInfo.transitMinutes,
      distance_km: slotInfo.distanceKm,
      has_conflict: conflicting,
    };
  }));

  return {
    local: localWithAvailability.filter((v) => !v.has_conflict),
    shared: sharedWithAvailability.filter((v) => !v.has_conflict),
  };
}

/** Check if a vehicle has a test drive booked within 30 min of the requested slot */
async function hasSlotConflict(vehicleId: string, date: string, startMinutes: number, durationMinutes = 30): Promise<boolean> {
  const drives = await TestDrive.find({
    vehicle_id: vehicleId,
    scheduled_date: date,
    status: { $in: ['scheduled', 'confirmed', 'show', 'in_progress'] },
  }, { scheduled_time: 1, slot_duration_minutes: 1 }).lean();

  for (const d of drives) {
    const existing = timeToMinutes(String(d.scheduled_time || ''));
    const existingEnd = existing + Number(d.slot_duration_minutes || 30);
    const newEnd = startMinutes + durationMinutes;
    // Overlap check
    if (startMinutes < existingEnd && newEnd > existing) return true;
  }
  return false;
}

function timeToMinutes(t: string): number {
  const parts = String(t || '').split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}
