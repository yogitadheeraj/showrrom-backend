/**
 * vehicleFleetService.ts
 * ──────────────────────
 * Manages shared demo vehicles that rotate across multiple showroom locations.
 *
 * Key responsibilities:
 *  1. OSRM-based travel time between locations (server-side, no key needed)
 *  2. Slot availability for a vehicle at a target location (accounts for transit)
 *  3. Scheduling and completing transits
 *  4. Auto-transit hook: called when a test drive ends
 *  5. Fleet overview for the dashboard
 */

import { randomUUID } from 'node:crypto';
import { Vehicle } from '../models/Vehicle.js';
import { VehicleTransit } from '../models/VehicleTransit.js';
import { TestDrive } from '../models/TestDrive.js';
import { Location } from '../models/Location.js';
import { Profile } from '../models/Profile.js';
import { UserRole } from '../models/UserRole.js';
import { enqueueEmail } from './emailQueueService.js';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';
// Buffer minutes added after a test drive before transit can start (safety / handover)
const POST_DRIVE_BUFFER_MINUTES = 15;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function lean(doc: any) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o._id;
  return o;
}

/** Convert "HH:MM:SS" or "HH:MM" to total minutes since midnight */
function timeToMinutes(t: string): number {
  const parts = String(t || '').split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

/** Add `minutes` to a Date and return ISO string */
function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// OSRM
// ─────────────────────────────────────────────────────────────────────────────

export interface RouteInfo {
  distanceKm: number;
  durationMinutes: number;
}

/**
 * Get driving distance + time between two lat/lng points via OSRM.
 * Returns null if either point is missing coordinates or OSRM fails.
 */
export async function osrmRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): Promise<RouteInfo | null> {
  try {
    const url = `${OSRM_BASE}/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
    const res = await fetch(url);
    const data = await res.json() as any;
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    return {
      distanceKm: Math.round(data.routes[0].distance / 100) / 10,
      durationMinutes: Math.round(data.routes[0].duration / 60),
    };
  } catch {
    return null;
  }
}

/**
 * Get driving route info between two Location IDs.
 * Returns null if coordinates are missing on either location.
 */
export async function routeBetweenLocations(fromId: string, toId: string): Promise<RouteInfo | null> {
  if (fromId === toId) return { distanceKm: 0, durationMinutes: 0 };
  const [from, to] = await Promise.all([
    Location.findOne({ id: fromId }, { latitude: 1, longitude: 1 }).lean(),
    Location.findOne({ id: toId }, { latitude: 1, longitude: 1 }).lean(),
  ]);
  const fLat = parseFloat(String(from?.latitude || ''));
  const fLng = parseFloat(String(from?.longitude || ''));
  const tLat = parseFloat(String(to?.latitude || ''));
  const tLng = parseFloat(String(to?.longitude || ''));
  if (isNaN(fLat) || isNaN(fLng) || isNaN(tLat) || isNaN(tLng)) return null;
  return osrmRoute(fLat, fLng, tLat, tLng);
}

// ─────────────────────────────────────────────────────────────────────────────
// Slot availability for a shared vehicle at a target location
// ─────────────────────────────────────────────────────────────────────────────

export interface VehicleSlotInfo {
  /** ISO timestamp: earliest time the vehicle can start a test drive at toLocationId */
  availableFrom: string;
  /** 'at_location' | 'in_transit' | 'completing_drive' */
  vehicleState: string;
  /** Where vehicle is right now */
  currentLocationId: string | null;
  currentLocationName: string | null;
  /** Estimated travel minutes from currentLocation to toLocation */
  transitMinutes: number | null;
  distanceKm: number | null;
  /** Which active transit record is pending (if any) */
  pendingTransitId: string | null;
  /** Next test drive blocking the vehicle (if any) */
  nextDriveEndsAt: string | null;
}

/**
 * Determine the earliest time a shared vehicle can be used at a target location
 * on a given date.
 *
 * Algorithm:
 *  1. Find the vehicle's effective current location (from active transit or vehicle.current_location_id)
 *  2. Find the latest test drive on `date` for this vehicle across ALL locations
 *  3. The vehicle is "free" after that drive ends + POST_DRIVE_BUFFER_MINUTES
 *  4. If vehicle is at a different location, add transit time
 *  5. Return the resulting earliest start time
 */
export async function getVehicleAvailabilityAtLocation(
  vehicleId: string,
  toLocationId: string,
  date: string,   // YYYY-MM-DD
): Promise<VehicleSlotInfo> {
  const vehicle = await Vehicle.findOne({ id: vehicleId }).lean();
  if (!vehicle) {
    return {
      availableFrom: `${date}T00:00:00.000Z`,
      vehicleState: 'unknown',
      currentLocationId: null, currentLocationName: null,
      transitMinutes: null, distanceKm: null, pendingTransitId: null, nextDriveEndsAt: null,
    };
  }

  // Effective current location
  const effectiveLocationId: string = String(vehicle.current_location_id || vehicle.location_id);

  // ── Check for an active / scheduled transit to toLocationId ──
  const pendingTransit = await VehicleTransit.findOne({
    vehicle_id: vehicleId,
    to_location_id: toLocationId,
    status: { $in: ['scheduled', 'in_transit'] },
  }).sort({ eta_time: 1 }).lean();

  // ── Latest blocking test drive on that date (any location) ──
  const allDrivesOnDate = await TestDrive.find({
    vehicle_id: vehicleId,
    scheduled_date: date,
    status: { $in: ['scheduled', 'confirmed', 'show', 'in_progress', 'rescheduled'] },
  }, { scheduled_time: 1, slot_duration_minutes: 1, location_id: 1 }).lean();

  let latestEndMinutes = 0; // minutes since midnight when last drive at any location ends
  let nextDriveEndsAt: string | null = null;

  for (const td of allDrivesOnDate) {
    const startMin = timeToMinutes(String(td.scheduled_time || ''));
    const dur = Number(td.slot_duration_minutes || 30);
    const endMin = startMin + dur;
    if (endMin > latestEndMinutes) {
      latestEndMinutes = endMin;
      // Construct ISO end time
      const endHour = Math.floor(endMin / 60);
      const endMins = endMin % 60;
      nextDriveEndsAt = `${date}T${String(endHour).padStart(2, '0')}:${String(endMins).padStart(2, '0')}:00.000Z`;
    }
  }

  // Vehicle is free after last drive + buffer
  const freeAfterMinutes = latestEndMinutes + (latestEndMinutes > 0 ? POST_DRIVE_BUFFER_MINUTES : 0);

  // ── Determine if transit is needed ──
  let transitMinutes: number | null = null;
  let distanceKm: number | null = null;
  let pendingTransitId: string | null = null;
  let vehicleState = 'at_location';

  if (pendingTransit) {
    // There's already a transit heading our way
    transitMinutes = pendingTransit.transit_minutes ?? null;
    distanceKm = pendingTransit.distance_km ?? null;
    pendingTransitId = String(pendingTransit.id);
    vehicleState = pendingTransit.status === 'in_transit' ? 'in_transit' : 'scheduled_transit';
  } else if (effectiveLocationId !== toLocationId) {
    // Need to calculate how long it takes to get here
    const route = await routeBetweenLocations(effectiveLocationId, toLocationId);
    if (route) {
      transitMinutes = route.durationMinutes;
      distanceKm = route.distanceKm;
    }
    vehicleState = 'at_other_location';
  }

  if (latestEndMinutes > 0) vehicleState = 'completing_drive';

  // ── Calculate earliest available time ──
  const totalBlockedMinutes = freeAfterMinutes + (transitMinutes ?? 0);
  const availableHour = Math.floor(totalBlockedMinutes / 60);
  const availableMin = totalBlockedMinutes % 60;
  let availableFrom: string;

  if (totalBlockedMinutes === 0) {
    availableFrom = `${date}T00:00:00.000Z`;
  } else {
    availableFrom = `${date}T${String(availableHour).padStart(2, '0')}:${String(availableMin).padStart(2, '0')}:00.000Z`;
  }

  // Resolve location name
  const currentLoc = await Location.findOne({ id: effectiveLocationId }, { name: 1 }).lean();

  return {
    availableFrom,
    vehicleState,
    currentLocationId: effectiveLocationId,
    currentLocationName: String(currentLoc?.name || effectiveLocationId),
    transitMinutes,
    distanceKm,
    pendingTransitId,
    nextDriveEndsAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transit management
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduleTransitOptions {
  vehicleId: string;
  fromLocationId: string;
  toLocationId: string;
  departTime: Date;
  trigger: 'auto' | 'manual';
  triggeredByTestDriveId?: string | null;
  forTestDriveId?: string | null;
  notes?: string | null;
  /** Profile ID of the person who scheduled this transit */
  scheduledByProfileId?: string | null;
}

/**
 * Schedule (or immediately start) a vehicle transit between two locations.
 * Calculates route via OSRM and creates a VehicleTransit record.
 * Also updates the vehicle's transit_status and transit_eta.
 */
export async function scheduleTransit(opts: ScheduleTransitOptions) {
  const route = await routeBetweenLocations(opts.fromLocationId, opts.toLocationId);
  const transitMins = route?.durationMinutes ?? 60; // fallback 60min if no coords
  const distKm = route?.distanceKm ?? null;

  const etaTime = addMinutes(opts.departTime, transitMins);

  const transit = new VehicleTransit({
    id: randomUUID(),
    vehicle_id: opts.vehicleId,
    from_location_id: opts.fromLocationId,
    to_location_id: opts.toLocationId,
    trigger: opts.trigger,
    triggered_by_test_drive_id: opts.triggeredByTestDriveId ?? null,
    for_test_drive_id: opts.forTestDriveId ?? null,
    distance_km: distKm,
    transit_minutes: transitMins,
    depart_time: opts.departTime.toISOString(),
    eta_time: etaTime,
    status: 'scheduled',
    dispatched_at: null,
    arrived_at: null,
    notes: opts.notes ?? null,
    scheduled_by_profile_id: opts.scheduledByProfileId ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await transit.save();

  // Update vehicle transit state
  await Vehicle.findOneAndUpdate(
    { id: opts.vehicleId },
    {
      $set: {
        transit_status: 'in_transit',
        transit_eta: etaTime,
        transit_to_location_id: opts.toLocationId,
        updated_at: new Date().toISOString(),
      },
    },
  );

  return lean(transit);
}

/**
 * Dispatch a transit immediately (sets status to 'in_transit' with dispatched_at = now).
 * Also auto-assigns a security receiver at the destination if none is set yet.
 */
export async function dispatchTransit(transitId: string) {
  const now = new Date().toISOString();
  const doc = await VehicleTransit.findOneAndUpdate(
    { id: transitId, status: { $in: ['scheduled'] } },
    { $set: { status: 'in_transit', dispatched_at: now, updated_at: now } },
    { new: true },
  );
  if (!doc) return null;

  // Auto-assign a security receiver if not already assigned
  if (!doc.receiver_profile_id) {
    void autoAssignReceiver(transitId).catch(() => null);
  }

  return lean(doc);
}

/**
 * Mark a transit as arrived — updates vehicle.current_location_id and clears transit state.
 */
export async function markTransitArrived(transitId: string) {
  const now = new Date().toISOString();
  const transit = await VehicleTransit.findOneAndUpdate(
    { id: transitId, status: { $in: ['scheduled', 'in_transit'] } },
    { $set: { status: 'arrived', arrived_at: now, updated_at: now } },
    { new: true },
  );
  if (!transit) return null;

  // Update vehicle: move to new location, clear transit state
  await Vehicle.findOneAndUpdate(
    { id: transit.vehicle_id },
    {
      $set: {
        current_location_id: transit.to_location_id,
        transit_status: 'at_location',
        transit_eta: null,
        transit_to_location_id: null,
        updated_at: now,
      },
    },
  );

  return lean(transit);
}

/**
 * Cancel a transit (e.g. if the test drive it was for is cancelled).
 */
export async function cancelTransit(transitId: string, reason?: string) {
  const now = new Date().toISOString();
  const doc = await VehicleTransit.findOneAndUpdate(
    { id: transitId, status: { $in: ['scheduled'] } },
    { $set: { status: 'cancelled', notes: reason ?? null, updated_at: now } },
    { new: true },
  );
  if (!doc) return null;

  // If no other active transits, clear vehicle transit state
  const otherActive = await VehicleTransit.countDocuments({
    vehicle_id: doc.vehicle_id,
    status: { $in: ['scheduled', 'in_transit'] },
  });
  if (otherActive === 0) {
    await Vehicle.findOneAndUpdate(
      { id: doc.vehicle_id },
      { $set: { transit_status: 'at_location', transit_eta: null, transit_to_location_id: null, updated_at: now } },
    );
  }

  return lean(doc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-transit hook — called when a test drive completes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * After a test drive ends at `fromLocationId`, check if the vehicle has a
 * *next* scheduled test drive at a different location. If so, auto-schedule transit.
 *
 * Called from testDriveService after status is set to 'completed' / 'key_handover_to_sales'.
 */
export async function autoTransitAfterDrive(
  vehicleId: string,
  fromLocationId: string,
  completedTestDriveId: string,
  endedAt: Date,
) {
  // Find the next scheduled/confirmed drive for this vehicle (any location, future)
  const departTime = new Date(endedAt.getTime() + POST_DRIVE_BUFFER_MINUTES * 60_000);

  const nextDrive = await TestDrive.findOne({
    vehicle_id: vehicleId,
    id: { $ne: completedTestDriveId },
    status: { $in: ['scheduled', 'confirmed'] },
    scheduled_date: { $gte: endedAt.toISOString().split('T')[0] },
  }).sort({ scheduled_date: 1, scheduled_time: 1 }).lean();

  if (!nextDrive || nextDrive.location_id === fromLocationId) {
    // No transit needed — vehicle stays here
    await Vehicle.findOneAndUpdate(
      { id: vehicleId },
      {
        $set: {
          current_location_id: fromLocationId,
          transit_status: 'at_location',
          transit_eta: null,
          transit_to_location_id: null,
          updated_at: new Date().toISOString(),
        },
      },
    );
    return null;
  }

  // Schedule transit to nextDrive's location
  return scheduleTransit({
    vehicleId,
    fromLocationId,
    toLocationId: String(nextDrive.location_id),
    departTime,
    trigger: 'auto',
    triggeredByTestDriveId: completedTestDriveId,
    forTestDriveId: String(nextDrive.id),
    notes: `Auto-dispatched after test drive ${completedTestDriveId}`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Fleet overview
// ─────────────────────────────────────────────────────────────────────────────

export async function getFleetOverview(dealerId?: string, locationId?: string) {
  // Get all shared vehicles
  const vehicleQuery: Record<string, unknown> = { is_shared: true, is_active: true };
  if (dealerId) {
    // Get all location ids for this dealer
    const locations = await Location.find({ dealer_id: dealerId }, { id: 1 }).lean();
    const locIds = locations.map((l: any) => l.id);
    vehicleQuery.location_id = { $in: locIds };
  }
  // Filter by shared_location_ids: empty = all locations, non-empty = specific
  if (locationId) {
    vehicleQuery.$or = [
      { shared_location_ids: { $exists: false } },
      { shared_location_ids: { $size: 0 } },
      { shared_location_ids: locationId },
    ] as any;
  }

  const vehicles = await Vehicle.find(vehicleQuery).lean();

  // Get active transits
  const vehicleIds = vehicles.map((v: any) => v.id);
  const activeTransits = await VehicleTransit.find({
    vehicle_id: { $in: vehicleIds },
    status: { $in: ['scheduled', 'in_transit'] },
  }).lean();

  // Get today's + tomorrow's test drives for these vehicles
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const upcomingDrives = await TestDrive.find({
    vehicle_id: { $in: vehicleIds },
    scheduled_date: { $gte: today, $lte: tomorrow },
    status: { $in: ['scheduled', 'confirmed', 'show', 'in_progress'] },
  }).lean();

  // Fetch all involved locations
  const allLocIds = new Set<string>();
  vehicles.forEach((v: any) => {
    allLocIds.add(v.location_id);
    if (v.current_location_id) allLocIds.add(v.current_location_id);
  });
  activeTransits.forEach((t: any) => {
    allLocIds.add(t.from_location_id);
    allLocIds.add(t.to_location_id);
  });
  const locationDocs = await Location.find({ id: { $in: Array.from(allLocIds) } }, { id: 1, name: 1, city: 1 }).lean();
  const locMap: Record<string, any> = {};
  locationDocs.forEach((l: any) => { locMap[l.id] = l; });

  // Resolve receiver names for active transits
  const receiverIds = [...new Set(
    activeTransits.map((t: any) => t.receiver_profile_id).filter(Boolean) as string[]
  )];
  const receiverProfiles = receiverIds.length > 0
    ? await Profile.find({ id: { $in: receiverIds } }, { id: 1, full_name: 1 }).lean()
    : [];
  const receiverNameMap: Record<string, string> = {};
  receiverProfiles.forEach((p: any) => { receiverNameMap[String(p.id)] = p.full_name; });

  const transitMap: Record<string, any[]> = {};
  activeTransits.forEach((t: any) => {
    if (!transitMap[String(t.vehicle_id)]) transitMap[String(t.vehicle_id)] = [];
    transitMap[String(t.vehicle_id)].push({
      ...t,
      _id: undefined,
      receiver_name: t.receiver_profile_id ? (receiverNameMap[String(t.receiver_profile_id)] ?? null) : null,
    });
  });

  const driveMap: Record<string, any[]> = {};
  upcomingDrives.forEach((d: any) => {
    if (!driveMap[String(d.vehicle_id)]) driveMap[String(d.vehicle_id)] = [];
    driveMap[String(d.vehicle_id)].push({ ...d, _id: undefined });
  });

  return vehicles.map((v: any) => {
    const effectiveLoc = v.current_location_id || v.location_id;
    const o = { ...v } as any;
    delete o._id;
    return {
      ...o,
      current_location: locMap[effectiveLoc] || null,
      home_location: locMap[v.location_id] || null,
      active_transits: transitMap[v.id] || [],
      upcoming_drives: driveMap[v.id] || [],
    };
  });
}

export async function listTransits(filters: {
  vehicle_id?: string;
  status?: string | string[];
  from_date?: string;
  to_date?: string;
  receiver_profile_id?: string;
  to_location_id?: string;
}) {
  const q: Record<string, unknown> = {};
  if (filters.vehicle_id) q.vehicle_id = filters.vehicle_id;
  if (filters.to_location_id) q.to_location_id = filters.to_location_id;
  if (filters.receiver_profile_id) q.receiver_profile_id = filters.receiver_profile_id;
  if (filters.status) {
    q.status = Array.isArray(filters.status) ? { $in: filters.status } : filters.status;
  }
  if (filters.from_date || filters.to_date) {
    const range: Record<string, string> = {};
    if (filters.from_date) range.$gte = filters.from_date;
    if (filters.to_date) range.$lte = filters.to_date;
    q.depart_time = range;
  }
  const docs = await VehicleTransit.find(q).sort({ depart_time: -1 }).lean();
  return docs.map((d: any) => { const o = { ...d }; delete (o as any)._id; return o; });
}

// ─────────────────────────────────────────────────────────────────────────────
// Security receiver management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all active security staff assigned to a given location.
 * Used to build the receiver selection list.
 */
export async function getSecurityAtLocation(locationId: string) {
  // Find user_ids with 'security' role
  const securityRoles = await UserRole.find({ role: 'security' }, { user_id: 1 }).lean();
  const userIds = securityRoles.map((r: any) => String(r.user_id));
  if (userIds.length === 0) return [];

  // Find profiles at this location with those user_ids
  const profiles = await Profile.find({
    user_id: { $in: userIds },
    location_id: locationId,
    is_active: true,
    on_leave: { $ne: true },
  }, { id: 1, full_name: 1, email: 1, phone: 1, user_id: 1, location_id: 1 }).lean();

  return profiles.map((p: any) => { const o = { ...p }; delete o._id; return o; });
}

/**
 * Send an email notification to the assigned security receiver.
 * Fire-and-forget — called after receiver_profile_id is set on a transit.
 */
async function sendReceiverEmail(transitId: string, receiverProfileId: string): Promise<void> {
  try {
    const [transit, receiverProfile] = await Promise.all([
      VehicleTransit.findOne({ id: transitId }).lean(),
      Profile.findOne({ id: receiverProfileId }, { full_name: 1, email: 1 }).lean(),
    ]);
    if (!transit || !receiverProfile?.email) return;

    const [vehicle, fromLoc, toLoc] = await Promise.all([
      Vehicle.findOne({ id: transit.vehicle_id }, { brand: 1, model: 1, registration_number: 1 }).lean(),
      Location.findOne({ id: transit.from_location_id }, { name: 1, city: 1 }).lean(),
      Location.findOne({ id: transit.to_location_id }, { name: 1, city: 1 }).lean(),
    ]);

    const fmtDt = (iso: string) =>
      new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });

    const vehicleLabel = vehicle ? `${vehicle.brand} ${vehicle.model}${vehicle.registration_number ? ` (${vehicle.registration_number})` : ''}` : 'a vehicle';
    const fromLabel = fromLoc ? `${fromLoc.name}${fromLoc.city ? `, ${fromLoc.city}` : ''}` : 'origin';
    const toLabel = toLoc ? `${toLoc.name}${toLoc.city ? `, ${toLoc.city}` : ''}` : 'your location';
    const etaLabel = transit.eta_time ? fmtDt(String(transit.eta_time)) : '—';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;background:#f9fafb;padding:0;margin:0;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:20px 24px;color:#fff;">
    <h2 style="margin:0;font-size:18px;font-weight:700;">🚗 Vehicle Incoming — Action Required</h2>
    <p style="margin:6px 0 0;opacity:.85;font-size:13px;">You have been assigned to receive a shared vehicle</p>
  </div>
  <div style="padding:24px;">
    <p style="margin:0 0 16px;">Hi <strong>${receiverProfile.full_name}</strong>,</p>
    <p style="margin:0 0 16px;">You have been assigned as the security receiver for an incoming vehicle at <strong>${toLabel}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr><td style="padding:8px 12px;background:#f3f4f6;border-radius:6px 6px 0 0;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;">Vehicle</td><td style="padding:8px 12px;background:#f3f4f6;border-radius:6px 6px 0 0;font-size:14px;font-weight:600;">${vehicleLabel}</td></tr>
      <tr><td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">From</td><td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:14px;">${fromLabel}</td></tr>
      <tr><td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Arriving At</td><td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:14px;font-weight:600;">${toLabel}</td></tr>
      <tr><td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">ETA</td><td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:14px;font-weight:700;color:#1e40af;">${etaLabel}</td></tr>
      ${transit.distance_km != null ? `<tr><td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Distance</td><td style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:14px;">${transit.distance_km} km</td></tr>` : ''}
    </table>
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:16px;">
      <p style="margin:0;font-size:13px;color:#92400e;">⚠️ <strong>Your action is required:</strong> Log in to the app and mark the vehicle as received once it arrives at your location.</p>
    </div>
    <p style="margin:0;font-size:12px;color:#9ca3af;">This notification was sent by AutoAdvant. Do not reply to this email.</p>
  </div>
</div>
</body></html>`;

    await enqueueEmail('transactional_emails', {
      to: String(receiverProfile.email),
      subject: `Action Required: Receive ${vehicleLabel} — ETA ${etaLabel}`,
      html,
      text: `Hi ${receiverProfile.full_name},\n\nYou have been assigned to receive ${vehicleLabel} coming from ${fromLabel} to ${toLabel}.\nETA: ${etaLabel}\n\nPlease mark the vehicle as received in the app when it arrives.`,
    });
  } catch (err) {
    console.error('[vehicleFleet] sendReceiverEmail failed:', err);
  }
}

/**
 * Auto-assign a security receiver when a transit is dispatched.
 * Picks the first available security staff at the destination location.
 * If none available, transit proceeds without a receiver (can be assigned manually).
 */
export async function autoAssignReceiver(transitId: string): Promise<string | null> {
  const transit = await VehicleTransit.findOne({ id: transitId }).lean();
  if (!transit) return null;

  const securityList = await getSecurityAtLocation(String(transit.to_location_id));
  if (securityList.length === 0) return null;

  // Round-robin: pick the one with fewest active receive assignments today
  const today = new Date().toISOString().split('T')[0];
  const counts = await Promise.all(securityList.map(async (s: any) => {
    const c = await VehicleTransit.countDocuments({
      receiver_profile_id: s.id,
      status: { $in: ['scheduled', 'in_transit'] },
      depart_time: { $gte: `${today}T00:00:00.000Z` },
    });
    return { profileId: String(s.id), count: c };
  }));

  counts.sort((a, b) => a.count - b.count);
  const assignedProfileId = counts[0].profileId;

  const now = new Date().toISOString();
  await VehicleTransit.updateOne(
    { id: transitId },
    { $set: { receiver_profile_id: assignedProfileId, receiver_assigned_at: now, updated_at: now } },
  );

  // Send email notification to assigned receiver (fire-and-forget)
  void sendReceiverEmail(transitId, assignedProfileId).catch(() => null);

  return assignedProfileId;
}

/**
 * Manually assign a specific security person as receiver.
 */
export async function assignReceiver(transitId: string, profileId: string) {
  const now = new Date().toISOString();
  const doc = await VehicleTransit.findOneAndUpdate(
    { id: transitId, status: { $in: ['scheduled', 'in_transit'] } },
    { $set: { receiver_profile_id: profileId, receiver_assigned_at: now, updated_at: now } },
    { new: true },
  );
  if (!doc) return null;

  // Send email notification to the newly assigned receiver (fire-and-forget)
  void sendReceiverEmail(transitId, profileId).catch(() => null);

  return lean(doc);
}

/**
 * Security staff marks vehicle as received at their location.
 * - Only the assigned receiver OR any security at that location can mark received.
 * - Internally calls markTransitArrived to also update vehicle.current_location_id.
 */
export async function markVehicleReceived(
  transitId: string,
  receiverProfileId: string,
  notes?: string,
) {
  const transit = await VehicleTransit.findOne({ id: transitId }).lean();
  if (!transit) throw new Error('Transit not found');

  if (!['scheduled', 'in_transit'].includes(String(transit.status))) {
    throw new Error(`Cannot receive a transit with status: ${transit.status}`);
  }

  // Verify receiver is security at the destination location
  const profile = await Profile.findOne({ id: receiverProfileId }, { location_id: 1, user_id: 1 }).lean();
  if (!profile) throw new Error('Receiver profile not found');

  // Allow: assigned receiver, or any security at destination
  const securityAtDest = await getSecurityAtLocation(String(transit.to_location_id));
  const isAuthorized =
    String(transit.receiver_profile_id) === receiverProfileId ||
    securityAtDest.some((s: any) => s.id === receiverProfileId);

  if (!isAuthorized) {
    throw new Error('Forbidden: you are not assigned as receiver for this transit');
  }

  const now = new Date().toISOString();
  // Update transit with receiver info + mark arrived
  await VehicleTransit.updateOne(
    { id: transitId },
    {
      $set: {
        receiver_profile_id: receiverProfileId,
        received_notes: notes || null,
        status: 'arrived',
        arrived_at: now,
        updated_at: now,
      },
    },
  );

  // Update vehicle: move to destination, clear transit state
  await Vehicle.findOneAndUpdate(
    { id: transit.vehicle_id },
    {
      $set: {
        current_location_id: transit.to_location_id,
        transit_status: 'at_location',
        transit_eta: null,
        transit_to_location_id: null,
        updated_at: now,
      },
    },
  );

  const updated = await VehicleTransit.findOne({ id: transitId }).lean();
  return updated ? lean(updated) : null;
}

/**
 * Get all incoming transits for a given location (for security dashboard).
 * Returns transits heading to this location that are scheduled or in_transit.
 */
export async function getIncomingTransitsForLocation(locationId: string) {
  const transits = await VehicleTransit.find({
    to_location_id: locationId,
    status: { $in: ['scheduled', 'in_transit'] },
  }).sort({ eta_time: 1 }).lean();

  if (transits.length === 0) return [];

  // Enrich with vehicle + from_location + receiver profile info
  const vehicleIds = [...new Set(transits.map((t: any) => String(t.vehicle_id)))];
  const fromLocIds = [...new Set(transits.map((t: any) => String(t.from_location_id)))];
  const receiverIds = transits
    .map((t: any) => t.receiver_profile_id)
    .filter(Boolean) as string[];

  const [vehicles, fromLocs, receivers] = await Promise.all([
    Vehicle.find({ id: { $in: vehicleIds } }, { id: 1, brand: 1, model: 1, variant: 1, color: 1, registration_number: 1 }).lean(),
    Location.find({ id: { $in: fromLocIds } }, { id: 1, name: 1, city: 1 }).lean(),
    receiverIds.length > 0
      ? Profile.find({ id: { $in: receiverIds } }, { id: 1, full_name: 1, phone: 1 }).lean()
      : Promise.resolve([]),
  ]);

  const vMap: Record<string, any> = {};
  vehicles.forEach((v: any) => { vMap[v.id] = v; });
  const lMap: Record<string, any> = {};
  fromLocs.forEach((l: any) => { lMap[l.id] = l; });
  const rMap: Record<string, any> = {};
  (receivers as any[]).forEach((r: any) => { rMap[r.id] = r; });

  return transits.map((t: any) => {
    const o = { ...t } as any;
    delete o._id;
    return {
      ...o,
      vehicle: vMap[String(t.vehicle_id)] || null,
      from_location: lMap[String(t.from_location_id)] || null,
      receiver: t.receiver_profile_id ? (rMap[String(t.receiver_profile_id)] || null) : null,
    };
  });
}

import { VehicleTransitRequest } from '../models/VehicleTransitRequest.js';

// ─────────────────────────────────────────────────────────────────────────────
// Transit Request helpers (email)
// ─────────────────────────────────────────────────────────────────────────────

/** Get manager profiles at a location (DEALER_ADMIN + SALES_ADMIN roles) */
async function getManagersAtLocation(locationId: string) {
  const managerRoles = await UserRole.find(
    { role: { $in: ['dealer_admin', 'sales_admin'] } },
    { user_id: 1, role: 1 },
  ).lean();
  if (managerRoles.length === 0) return [];
  const userIds = managerRoles.map((r: any) => String(r.user_id));
  const profiles = await Profile.find(
    { user_id: { $in: userIds }, location_id: locationId, is_active: true },
    { id: 1, full_name: 1, email: 1, phone: 1, user_id: 1, location_id: 1 },
  ).lean();
  return profiles.map((p: any) => { const o = { ...p }; delete o._id; return o; });
}

/** Enrich a transit request with related records */
async function enrichRequest(req: any) {
  const [vehicle, fromLoc, toLoc, requester, actioner] = await Promise.all([
    Vehicle.findOne({ id: req.vehicle_id }, { brand: 1, model: 1, variant: 1, registration_number: 1, color: 1 }).lean(),
    Location.findOne({ id: req.from_location_id }, { name: 1, city: 1 }).lean(),
    Location.findOne({ id: req.to_location_id }, { name: 1, city: 1 }).lean(),
    Profile.findOne({ id: req.requested_by_profile_id }, { full_name: 1, email: 1, phone: 1 }).lean(),
    req.actioned_by_profile_id
      ? Profile.findOne({ id: req.actioned_by_profile_id }, { full_name: 1, email: 1 }).lean()
      : Promise.resolve(null),
  ]);
  const o = { ...req } as any;
  delete o._id;
  return {
    ...o,
    vehicle: vehicle ? { ...vehicle, _id: undefined } : null,
    from_location: fromLoc ? { ...fromLoc, _id: undefined } : null,
    to_location: toLoc ? { ...toLoc, _id: undefined } : null,
    requester: requester ? { ...requester, _id: undefined } : null,
    actioner: actioner ? { ...actioner, _id: undefined } : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transit Requests — full CRUD
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateTransitRequestOptions {
  vehicleId: string;
  fromLocationId: string;
  toLocationId: string;
  requestedByProfileId: string;
  neededForDate?: string | null;
  notes?: string | null;
  dealerId?: string | null;
}

/**
 * Sales manager creates a transit request for a shared vehicle at another location.
 *
 * Notifications sent (fire-and-forget):
 *  • All managers at the SOURCE (from) location — "New request pending your approval"
 *  • All security at the SOURCE location  — "FYI: vehicle may be dispatched soon"
 *  • Requester themselves — "Your request has been submitted"
 */
export async function createTransitRequest(opts: CreateTransitRequestOptions) {
  const now = new Date().toISOString();
  const req = new VehicleTransitRequest({
    id: randomUUID(),
    vehicle_id: opts.vehicleId,
    from_location_id: opts.fromLocationId,
    to_location_id: opts.toLocationId,
    requested_by_profile_id: opts.requestedByProfileId,
    requested_at: now,
    status: 'pending',
    requester_notes: opts.notes ?? null,
    needed_for_date: opts.neededForDate ?? null,
    dealer_id: opts.dealerId ?? null,
    created_at: now,
    updated_at: now,
  });
  await req.save();

  // Emit notifications (fire-and-forget)
  void sendTransitRequestEmails(String(req.id), 'created').catch(() => null);

  return lean(req);
}

/**
 * Source-branch manager approves the request → schedules a transit.
 *
 * Notifications sent:
 *  • Requester — "Your request was approved; vehicle en route"
 *  • Security at DESTINATION — "Incoming vehicle assigned"
 *  • Security at SOURCE — "Vehicle will be dispatched"
 */
export async function approveTransitRequest(
  requestId: string,
  managerProfileId: string,
  managerNotes?: string,
) {
  const request = await VehicleTransitRequest.findOne({ id: requestId, status: 'pending' }).lean();
  if (!request) throw new Error('Request not found or already actioned');

  const now = new Date();
  const nowIso = now.toISOString();

  // Schedule transit
  const transit = await scheduleTransit({
    vehicleId: String(request.vehicle_id),
    fromLocationId: String(request.from_location_id),
    toLocationId: String(request.to_location_id),
    departTime: now,
    trigger: 'manual',
    notes: `Transit request ${requestId} approved by ${managerProfileId}`,
  });

  await VehicleTransitRequest.updateOne(
    { id: requestId },
    {
      $set: {
        status: 'approved',
        manager_notes: managerNotes ?? null,
        actioned_by_profile_id: managerProfileId,
        actioned_at: nowIso,
        scheduled_transit_id: transit?.id ?? null,
        updated_at: nowIso,
      },
    },
  );

  void sendTransitRequestEmails(requestId, 'approved').catch(() => null);

  const updated = await VehicleTransitRequest.findOne({ id: requestId }).lean();
  return updated ? lean(updated) : null;
}

/**
 * Source-branch manager rejects the request.
 *
 * Notification sent:
 *  • Requester — "Your request was rejected" + manager's note
 */
export async function rejectTransitRequest(
  requestId: string,
  managerProfileId: string,
  managerNotes: string,
) {
  const request = await VehicleTransitRequest.findOne({ id: requestId, status: 'pending' }).lean();
  if (!request) throw new Error('Request not found or already actioned');

  const nowIso = new Date().toISOString();
  await VehicleTransitRequest.updateOne(
    { id: requestId },
    {
      $set: {
        status: 'rejected',
        manager_notes: managerNotes,
        actioned_by_profile_id: managerProfileId,
        actioned_at: nowIso,
        updated_at: nowIso,
      },
    },
  );

  void sendTransitRequestEmails(requestId, 'rejected').catch(() => null);

  const updated = await VehicleTransitRequest.findOne({ id: requestId }).lean();
  return updated ? lean(updated) : null;
}

/** Requester cancels their own pending request */
export async function cancelTransitRequest(requestId: string, requesterProfileId: string) {
  const request = await VehicleTransitRequest.findOne({
    id: requestId,
    requested_by_profile_id: requesterProfileId,
    status: 'pending',
  }).lean();
  if (!request) throw new Error('Request not found or cannot be cancelled');

  const nowIso = new Date().toISOString();
  await VehicleTransitRequest.updateOne(
    { id: requestId },
    { $set: { status: 'cancelled', updated_at: nowIso } },
  );

  const updated = await VehicleTransitRequest.findOne({ id: requestId }).lean();
  return updated ? lean(updated) : null;
}

/**
 * List transit requests with filters + enrichment.
 * Supports:
 *  from_location_id — requests the source branch needs to action (inbound for managers)
 *  to_location_id   — requests made BY this branch (outbound)
 *  requested_by_profile_id — requests by a specific staff member
 *  status           — pending | approved | rejected | cancelled (or array)
 *  dealer_id        — scope to dealer
 */
export async function listTransitRequests(filters: {
  from_location_id?: string;
  to_location_id?: string;
  requested_by_profile_id?: string;
  status?: string | string[];
  dealer_id?: string;
  limit?: number;
}) {
  const q: Record<string, unknown> = {};
  if (filters.from_location_id) q.from_location_id = filters.from_location_id;
  if (filters.to_location_id) q.to_location_id = filters.to_location_id;
  if (filters.requested_by_profile_id) q.requested_by_profile_id = filters.requested_by_profile_id;
  if (filters.dealer_id) q.dealer_id = filters.dealer_id;
  if (filters.status) {
    q.status = Array.isArray(filters.status) ? { $in: filters.status } : filters.status;
  }

  const docs = await VehicleTransitRequest.find(q)
    .sort({ requested_at: -1 })
    .limit(filters.limit ?? 100)
    .lean();

  return Promise.all(docs.map(enrichRequest));
}

// ─────────────────────────────────────────────────────────────────────────────
// Transit Request Email Notifications
// ─────────────────────────────────────────────────────────────────────────────

async function sendTransitRequestEmails(
  requestId: string,
  event: 'created' | 'approved' | 'rejected',
) {
  try {
    const request = await VehicleTransitRequest.findOne({ id: requestId }).lean();
    if (!request) return;

    const [vehicle, fromLoc, toLoc, requester] = await Promise.all([
      Vehicle.findOne({ id: request.vehicle_id }, { brand: 1, model: 1, variant: 1, registration_number: 1 }).lean(),
      Location.findOne({ id: request.from_location_id }, { name: 1, city: 1 }).lean(),
      Location.findOne({ id: request.to_location_id }, { name: 1, city: 1 }).lean(),
      Profile.findOne({ id: request.requested_by_profile_id }, { full_name: 1, email: 1 }).lean(),
    ]);

    const vehicleLabel = vehicle
      ? `${vehicle.brand} ${vehicle.model}${(vehicle as any).variant ? ` ${(vehicle as any).variant}` : ''}${vehicle.registration_number ? ` (${vehicle.registration_number})` : ''}`
      : 'a vehicle';
    const fromLabel = fromLoc ? `${fromLoc.name}${(fromLoc as any).city ? `, ${(fromLoc as any).city}` : ''}` : 'source branch';
    const toLabel = toLoc ? `${toLoc.name}${(toLoc as any).city ? `, ${(toLoc as any).city}` : ''}` : 'destination branch';

    const baseTable = `
      <table style="width:100%;border-collapse:collapse;font-size:14px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="padding:9px 14px;background:#f9fafb;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #e5e7eb;">Vehicle</td><td style="padding:9px 14px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-weight:600">${vehicleLabel}</td></tr>
        <tr><td style="padding:9px 14px;color:#6b7280;font-size:12px;border-bottom:1px solid #e5e7eb;">From Branch</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">${fromLabel}</td></tr>
        <tr><td style="padding:9px 14px;color:#6b7280;font-size:12px;border-bottom:1px solid #e5e7eb;">Requested By</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">${(requester as any)?.full_name || '—'}</td></tr>
        <tr><td style="padding:9px 14px;color:#6b7280;font-size:12px;border-bottom:1px solid #e5e7eb;">To Branch</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-weight:600;">${toLabel}</td></tr>
        ${request.needed_for_date ? `<tr><td style="padding:9px 14px;color:#6b7280;font-size:12px;border-bottom:1px solid #e5e7eb;">Needed For</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">${request.needed_for_date}</td></tr>` : ''}
        ${request.requester_notes ? `<tr><td style="padding:9px 14px;color:#6b7280;font-size:12px;">Requester Notes</td><td style="padding:9px 14px;">${request.requester_notes}</td></tr>` : ''}
      </table>`;

    const wrap = (title: string, subtitle: string, accentColor: string, body: string) => `
      <!DOCTYPE html><html><head><meta charset="UTF-8"></head>
      <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;background:#f9fafb;margin:0;padding:0;">
      <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <div style="background:${accentColor};padding:20px 24px;color:#fff;">
          <h2 style="margin:0;font-size:18px;font-weight:700;">${title}</h2>
          <p style="margin:6px 0 0;opacity:.85;font-size:13px;">${subtitle}</p>
        </div>
        <div style="padding:24px;">${body}</div>
      </div></body></html>`;

    // ── Event: CREATED — notify source managers + source security + requester ──
    if (event === 'created') {
      const [sourceMgrs, sourceSec] = await Promise.all([
        getManagersAtLocation(String(request.from_location_id)),
        getSecurityAtLocation(String(request.from_location_id)),
      ]);

      // To source managers: "New transit request pending approval"
      for (const mgr of sourceMgrs) {
        if (!mgr.email) continue;
        const html = wrap(
          '🚗 Transit Request — Approval Needed',
          `${(requester as any)?.full_name || 'A staff member'} at ${toLabel} is requesting a vehicle from your branch`,
          'linear-gradient(135deg,#b45309,#f59e0b)',
          `<p style="margin:0 0 16px">Hi <strong>${mgr.full_name}</strong>,</p>
           <p style="margin:0 0 16px">A transit request has been raised for a shared vehicle currently at <strong>${fromLabel}</strong>.</p>
           ${baseTable}
           <div style="margin-top:16px;padding:12px 16px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;font-size:13px;color:#92400e;">
             ⚙️ <strong>Action required:</strong> Please log in and approve or reject this request.
           </div>`,
        );
        await enqueueEmail('transactional_emails', {
          to: String(mgr.email),
          subject: `Transit Request: ${vehicleLabel} — Approval Needed`,
          html,
          text: `Hi ${mgr.full_name},\n\n${(requester as any)?.full_name || 'A staff member'} at ${toLabel} requested ${vehicleLabel} from ${fromLabel}.\n\nPlease log in to approve or reject.\n\nNotes: ${request.requester_notes || 'None'}`,
        });
      }

      // To source security: "FYI — vehicle may be dispatched soon"
      for (const sec of sourceSec) {
        if (!sec.email) continue;
        const html = wrap(
          '📋 FYI: Transit Request for Your Location',
          `A vehicle at ${fromLabel} may be dispatched pending manager approval`,
          'linear-gradient(135deg,#1e3a8a,#3b82f6)',
          `<p style="margin:0 0 16px">Hi <strong>${sec.full_name}</strong>,</p>
           <p style="margin:0 0 16px">A transit request is pending manager approval. If approved, <strong>${vehicleLabel}</strong> will be dispatched from ${fromLabel}.</p>
           ${baseTable}
           <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">No action required from you at this time. You will be notified if the request is approved.</p>`,
        );
        await enqueueEmail('transactional_emails', {
          to: String(sec.email),
          subject: `FYI: Transit Request for ${vehicleLabel} at ${fromLabel}`,
          html,
          text: `Hi ${sec.full_name},\n\nFYI: A transit request for ${vehicleLabel} at ${fromLabel} is pending manager approval. No action needed from you yet.`,
        });
      }

      // To requester: "Your request was submitted"
      if ((requester as any)?.email) {
        const html = wrap(
          '✅ Transit Request Submitted',
          `Your request for ${vehicleLabel} has been sent to ${fromLabel} for approval`,
          'linear-gradient(135deg,#065f46,#10b981)',
          `<p style="margin:0 0 16px">Hi <strong>${(requester as any).full_name}</strong>,</p>
           <p style="margin:0 0 16px">Your transit request has been submitted and is awaiting approval from the branch manager at <strong>${fromLabel}</strong>.</p>
           ${baseTable}
           <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">You will receive an email once the manager acts on your request.</p>`,
        );
        await enqueueEmail('transactional_emails', {
          to: String((requester as any).email),
          subject: `Transit Request Submitted — ${vehicleLabel}`,
          html,
          text: `Hi ${(requester as any).full_name},\n\nYour request for ${vehicleLabel} from ${fromLabel} to ${toLabel} has been submitted. You will be notified once the manager responds.`,
        });
      }
    }

    // ── Event: APPROVED ──────────────────────────────────────────────────────
    if (event === 'approved') {
      const actioner = request.actioned_by_profile_id
        ? await Profile.findOne({ id: request.actioned_by_profile_id }, { full_name: 1 }).lean()
        : null;
      const managerName = (actioner as any)?.full_name || 'The branch manager';

      // To requester: "Approved! Vehicle en route"
      if ((requester as any)?.email) {
        const html = wrap(
          '🎉 Transit Approved — Vehicle En Route!',
          `${managerName} at ${fromLabel} has approved your request`,
          'linear-gradient(135deg,#065f46,#10b981)',
          `<p style="margin:0 0 16px">Hi <strong>${(requester as any).full_name}</strong>,</p>
           <p style="margin:0 0 16px">Great news! Your transit request has been <strong style="color:#059669">approved</strong>. The vehicle will be dispatched to your branch.</p>
           ${baseTable}
           ${request.manager_notes ? `<div style="margin-top:14px;padding:12px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:13px;color:#166534;"><strong>Manager's note:</strong> ${request.manager_notes}</div>` : ''}
           <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Security at your location will be notified to receive the vehicle.</p>`,
        );
        await enqueueEmail('transactional_emails', {
          to: String((requester as any).email),
          subject: `✅ Transit Approved — ${vehicleLabel} En Route`,
          html,
          text: `Hi ${(requester as any).full_name},\n\nYour request for ${vehicleLabel} was approved by ${managerName}.\n\nNotes: ${request.manager_notes || 'None'}`,
        });
      }

      // To destination security: "Incoming vehicle — get ready to receive"
      const destSec = await getSecurityAtLocation(String(request.to_location_id));
      for (const sec of destSec) {
        if (!sec.email) continue;
        const html = wrap(
          '🚛 Incoming Vehicle — Prepare to Receive',
          `Approved transit from ${fromLabel} heading to ${toLabel}`,
          'linear-gradient(135deg,#1e40af,#6366f1)',
          `<p style="margin:0 0 16px">Hi <strong>${sec.full_name}</strong>,</p>
           <p style="margin:0 0 16px">A transit request has been approved. Please prepare to receive <strong>${vehicleLabel}</strong> at ${toLabel}.</p>
           ${baseTable}
           ${request.manager_notes ? `<div style="margin-top:14px;padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:13px;color:#1e40af;"><strong>Manager's note:</strong> ${request.manager_notes}</div>` : ''}
           <div style="margin-top:16px;padding:12px 16px;background:#fef3c7;border:1px solid #fde68a;border-radius:8px;font-size:13px;color:#92400e;">
             ⚠️ You may be assigned as the receiver. Mark the vehicle as received in the app once it arrives.
           </div>`,
        );
        await enqueueEmail('transactional_emails', {
          to: String(sec.email),
          subject: `Incoming Vehicle: ${vehicleLabel} from ${fromLabel}`,
          html,
          text: `Hi ${sec.full_name},\n\nA transit request was approved. Prepare to receive ${vehicleLabel} at ${toLabel}.`,
        });
      }

      // To source security: "Vehicle being dispatched from your location"
      const sourceSec = await getSecurityAtLocation(String(request.from_location_id));
      for (const sec of sourceSec) {
        if (!sec.email) continue;
        const html = wrap(
          '🚗 Vehicle Dispatch Approved',
          `${vehicleLabel} is being dispatched from ${fromLabel}`,
          'linear-gradient(135deg,#374151,#6b7280)',
          `<p style="margin:0 0 16px">Hi <strong>${sec.full_name}</strong>,</p>
           <p style="margin:0 0 16px">A transit for <strong>${vehicleLabel}</strong> from ${fromLabel} to ${toLabel} has been approved.</p>
           ${baseTable}
           <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Please assist with vehicle handover to the driver.</p>`,
        );
        await enqueueEmail('transactional_emails', {
          to: String(sec.email),
          subject: `Vehicle Dispatch: ${vehicleLabel} leaving ${fromLabel}`,
          html,
          text: `Hi ${sec.full_name},\n\nApproved: ${vehicleLabel} will be dispatched from ${fromLabel} to ${toLabel}.`,
        });
      }
    }

    // ── Event: REJECTED ──────────────────────────────────────────────────────
    if (event === 'rejected') {
      const actioner = request.actioned_by_profile_id
        ? await Profile.findOne({ id: request.actioned_by_profile_id }, { full_name: 1 }).lean()
        : null;
      const managerName = (actioner as any)?.full_name || 'The branch manager';

      if ((requester as any)?.email) {
        const html = wrap(
          '❌ Transit Request Rejected',
          `${managerName} at ${fromLabel} was unable to approve this request`,
          'linear-gradient(135deg,#991b1b,#ef4444)',
          `<p style="margin:0 0 16px">Hi <strong>${(requester as any).full_name}</strong>,</p>
           <p style="margin:0 0 16px">Unfortunately, your transit request for <strong>${vehicleLabel}</strong> has been <strong style="color:#dc2626">rejected</strong>.</p>
           ${baseTable}
           ${request.manager_notes ? `<div style="margin-top:14px;padding:12px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:13px;color:#991b1b;"><strong>Manager's reason:</strong> ${request.manager_notes}</div>` : ''}
           <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">You can submit a new request or explore other available vehicles.</p>`,
        );
        await enqueueEmail('transactional_emails', {
          to: String((requester as any).email),
          subject: `Transit Request Rejected — ${vehicleLabel}`,
          html,
          text: `Hi ${(requester as any).full_name},\n\nYour transit request for ${vehicleLabel} was rejected by ${managerName}.\n\nReason: ${request.manager_notes || 'Not provided'}`,
        });
      }
    }
  } catch (err) {
    console.error('[vehicleFleet] sendTransitRequestEmails failed:', err);
  }
}
