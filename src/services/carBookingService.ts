import { randomUUID } from 'node:crypto';
import { CarBooking, BookingStatus, PaymentMethod, PaymentStatus } from '../models/CarBooking.js';
import { Customer } from '../models/Customer.js';
import { Vehicle } from '../models/Vehicle.js';
import { Location } from '../models/Location.js';
import { Profile } from '../models/Profile.js';
import { TestDrive } from '../models/TestDrive.js';
import { sendMail } from './mailService.js';

function toPlain(doc: any) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj._id;
  return obj;
}

function formatCurrency(amount: number) {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

// ─── List (with enriched relations) ─────────────────────────────────────────

export async function listCarBookings(filters: Record<string, unknown> = {}) {
  const query: Record<string, unknown> = {};

  if (filters.location_id) query.location_id = filters.location_id;
  if (filters.location_ids && Array.isArray(filters.location_ids) && filters.location_ids.length > 0) {
    query.location_id = { $in: filters.location_ids };
  }
  if (filters.customer_id) query.customer_id = filters.customer_id;
  if (filters.sales_person_profile_id) query.sales_person_profile_id = filters.sales_person_profile_id;
  if (filters.booking_status) query.booking_status = filters.booking_status;

  const limit = typeof filters.limit === 'number' && filters.limit > 0 ? filters.limit : 200;

  const docs = await CarBooking.find(query)
    .sort({ created_at: -1 })
    .limit(limit)
    .lean();

  const rows = docs.map((d: any) => { const o = { ...d }; delete o._id; return o; });

  if (rows.length === 0) return rows;

  const customerIds  = Array.from(new Set(rows.map((r: any) => r.customer_id).filter(Boolean)));
  const vehicleIds   = Array.from(new Set(rows.map((r: any) => r.vehicle_id).filter(Boolean)));
  const locationIds  = Array.from(new Set(rows.map((r: any) => r.location_id).filter(Boolean)));
  const profileIds   = Array.from(new Set([
    ...rows.map((r: any) => r.sales_person_profile_id),
    ...rows.map((r: any) => r.cancelled_by_profile_id),
  ].filter(Boolean)));
  const tdIds        = Array.from(new Set(rows.map((r: any) => r.test_drive_id).filter(Boolean)));

  const [customers, vehicles, locations, profiles, testDrives] = await Promise.all([
    customerIds.length  ? Customer.find({ id: { $in: customerIds } }, { id: 1, full_name: 1, phone: 1, email: 1 }).lean() : [],
    vehicleIds.length   ? Vehicle.find({ id: { $in: vehicleIds } }, { id: 1, brand: 1, model: 1, variant: 1 }).lean() : [],
    locationIds.length  ? Location.find({ id: { $in: locationIds } }, { id: 1, name: 1 }).lean() : [],
    profileIds.length   ? Profile.find({ id: { $in: profileIds } }, { id: 1, full_name: 1, phone: 1 }).lean() : [],
    tdIds.length        ? TestDrive.find({ id: { $in: tdIds } }, { id: 1, scheduled_date: 1, scheduled_time: 1 }).lean() : [],
  ]);

  const cMap  = new Map((customers  as any[]).map((c: any) => [c.id, c]));
  const vMap  = new Map((vehicles   as any[]).map((v: any) => [v.id, v]));
  const lMap  = new Map((locations  as any[]).map((l: any) => [l.id, l]));
  const pMap  = new Map((profiles   as any[]).map((p: any) => [p.id, p]));
  const tdMap = new Map((testDrives as any[]).map((t: any) => [t.id, t]));

  return rows.map((r: any) => ({
    ...r,
    customers:   cMap.get(r.customer_id) || null,
    vehicles:    vMap.get(r.vehicle_id) || null,
    locations:   lMap.get(r.location_id) || null,
    salesPerson: pMap.get(r.sales_person_profile_id) || null,
    cancelledBy: pMap.get(r.cancelled_by_profile_id) || null,
    testDrive:   tdMap.get(r.test_drive_id) || null,
  }));
}

// ─── Get single ─────────────────────────────────────────────────────────────

export async function getCarBookingById(id: string) {
  const doc = await CarBooking.findOne({ id }).lean();
  if (!doc) return null;
  const o = { ...doc } as any;
  delete o._id;
  return o;
}

// ─── Create ─────────────────────────────────────────────────────────────────

export interface CreateCarBookingInput {
  customer_id?: string;
  vehicle_id?: string;
  location_id: string;
  test_drive_id?: string;
  opportunity_id?: string;
  sales_person_profile_id?: string;
  booking_status?: BookingStatus;
  payment_method?: PaymentMethod;
  payment_status?: PaymentStatus;
  booking_amount: number;
  payment_link?: string;
  notes?: string;
}

export async function createCarBooking(input: CreateCarBookingInput) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const doc = new CarBooking({
    id,
    customer_id: input.customer_id || null,
    vehicle_id: input.vehicle_id || null,
    location_id: input.location_id,
    test_drive_id: input.test_drive_id || null,
    opportunity_id: input.opportunity_id || null,
    sales_person_profile_id: input.sales_person_profile_id || null,
    booking_status: input.booking_status ?? 'confirmed',
    payment_method: input.payment_method ?? 'cash',
    payment_status: input.payment_status ?? (input.payment_method === 'cash' ? 'paid' : 'pending'),
    booking_amount: input.booking_amount,
    refund_amount: 0,
    payment_link: input.payment_link || null,
    notes: input.notes || null,
    created_at: now,
    updated_at: now,
  });
  await doc.save();
  return toPlain(doc);
}

// ─── Cancel ─────────────────────────────────────────────────────────────────

export interface CancelCarBookingInput {
  cancellation_reason: string;
  cancelled_by_profile_id?: string;
}

export async function cancelCarBooking(id: string, input: CancelCarBookingInput) {
  const now = new Date().toISOString();
  const doc = await CarBooking.findOneAndUpdate(
    { id, booking_status: 'confirmed' },
    {
      booking_status: 'cancelled',
      cancellation_reason: input.cancellation_reason,
      cancelled_at: now,
      cancelled_by_profile_id: input.cancelled_by_profile_id || null,
      updated_at: now,
    },
    { new: true }
  ).lean();

  if (!doc) return null;
  const booking = { ...doc } as any;
  delete booking._id;

  // Send cancel emails (non-blocking)
  void sendCancellationEmails(booking, 'cancel').catch(() => null);
  return booking;
}

// ─── Refund ──────────────────────────────────────────────────────────────────

export interface RefundCarBookingInput {
  refund_amount: number;
  refund_notes: string;
  cancelled_by_profile_id?: string;
}

export async function refundCarBooking(id: string, input: RefundCarBookingInput) {
  const now = new Date().toISOString();
  const doc = await CarBooking.findOneAndUpdate(
    { id, booking_status: 'confirmed' },
    {
      booking_status: 'refunded',
      payment_status: 'refunded',
      refund_amount: input.refund_amount,
      refund_notes: input.refund_notes,
      cancellation_reason: input.refund_notes,
      cancelled_at: now,
      refunded_at: now,
      cancelled_by_profile_id: input.cancelled_by_profile_id || null,
      updated_at: now,
    },
    { new: true }
  ).lean();

  if (!doc) return null;
  const booking = { ...doc } as any;
  delete booking._id;

  void sendCancellationEmails(booking, 'refund').catch(() => null);
  return booking;
}

// ─── Generic update ──────────────────────────────────────────────────────────

export async function updateCarBooking(id: string, updates: Partial<ICarBooking>) {
  const doc = await CarBooking.findOneAndUpdate(
    { id },
    { ...updates, updated_at: new Date().toISOString() },
    { new: true }
  ).lean();
  if (!doc) return null;
  const o = { ...doc } as any;
  delete o._id;
  return o;
}

// ─── Count ───────────────────────────────────────────────────────────────────

export async function countCarBookings(filters: Record<string, unknown> = {}) {
  const query: Record<string, unknown> = {};
  if (filters.location_id) query.location_id = filters.location_id;
  if (filters.location_ids && Array.isArray(filters.location_ids) && filters.location_ids.length > 0) {
    query.location_id = { $in: filters.location_ids };
  }
  if (filters.booking_status) query.booking_status = filters.booking_status;
  return CarBooking.countDocuments(query);
}

// ─── Email helpers ────────────────────────────────────────────────────────────

async function sendCancellationEmails(booking: any, mode: 'cancel' | 'refund') {
  // Look up customer & vehicle name
  const [customerDoc, vehicleDoc, locationDoc] = await Promise.all([
    booking.customer_id ? Customer.findOne({ id: booking.customer_id }, { full_name: 1, email: 1 }).lean() : null,
    booking.vehicle_id  ? Vehicle.findOne({ id: booking.vehicle_id }, { brand: 1, model: 1 }).lean() : null,
    booking.location_id ? Location.findOne({ id: booking.location_id }, { name: 1 }).lean() : null,
  ]);

  const customer = customerDoc as any;
  const vehicle  = vehicleDoc  as any;
  const location = locationDoc as any;

  const customerName  = customer?.full_name || 'Customer';
  const vehicleName   = vehicle  ? `${vehicle.brand} ${vehicle.model}`.trim() : 'Vehicle';
  const locationName  = location?.name || '';
  const amountStr     = formatCurrency(booking.booking_amount);
  const refundStr     = formatCurrency(booking.refund_amount || 0);
  const reason        = booking.cancellation_reason || booking.refund_notes || '—';
  const date          = new Date(booking.cancelled_at || booking.created_at).toLocaleDateString('en-IN');

  if (customer?.email) {
    const subject = mode === 'cancel'
      ? `Your car booking has been cancelled — ${vehicleName}`
      : `Refund initiated for your booking — ${vehicleName}`;

    const html = mode === 'cancel'
      ? cancellationEmailHtml({ customerName, vehicleName, locationName, amountStr, reason, date })
      : refundEmailHtml({ customerName, vehicleName, locationName, amountStr, refundStr, reason, date });

    await sendMail({ to: customer.email, subject, html }).catch(() => null);
  }

  // Get Organization Admin / sales admin emails from profiles at this location
  if (booking.location_id) {
    const adminProfiles = await Profile.find(
      { location_id: booking.location_id },
      { id: 1, full_name: 1 }
    ).lean();

    // We don't store email on Profile — skip for now (Supabase auth holds emails)
    // This is intentional: admins get in-app notifications via activity logs
    void adminProfiles; // referenced to avoid lint warning
  }
}

function cancellationEmailHtml(p: { customerName: string; vehicleName: string; locationName: string; amountStr: string; reason: string; date: string }) {
  return `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#e11d48">Booking Cancelled</h2>
  <p>Dear ${p.customerName},</p>
  <p>Your car booking has been <strong>cancelled</strong>.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px;border:1px solid #eee;color:#666">Vehicle</td><td style="padding:8px;border:1px solid #eee">${p.vehicleName}</td></tr>
    <tr><td style="padding:8px;border:1px solid #eee;color:#666">Location</td><td style="padding:8px;border:1px solid #eee">${p.locationName}</td></tr>
    <tr><td style="padding:8px;border:1px solid #eee;color:#666">Booking Amount</td><td style="padding:8px;border:1px solid #eee">${p.amountStr}</td></tr>
    <tr><td style="padding:8px;border:1px solid #eee;color:#666">Reason</td><td style="padding:8px;border:1px solid #eee">${p.reason}</td></tr>
    <tr><td style="padding:8px;border:1px solid #eee;color:#666">Date</td><td style="padding:8px;border:1px solid #eee">${p.date}</td></tr>
  </table>
  <p>If you have questions, please contact our sales team.</p>
  <p style="color:#666;font-size:12px">This is an automated notification. Please do not reply.</p>
</div>`;
}

function refundEmailHtml(p: { customerName: string; vehicleName: string; locationName: string; amountStr: string; refundStr: string; reason: string; date: string }) {
  return `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#d97706">Refund Initiated</h2>
  <p>Dear ${p.customerName},</p>
  <p>A <strong>refund</strong> has been initiated for your car booking.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:8px;border:1px solid #eee;color:#666">Vehicle</td><td style="padding:8px;border:1px solid #eee">${p.vehicleName}</td></tr>
    <tr><td style="padding:8px;border:1px solid #eee;color:#666">Location</td><td style="padding:8px;border:1px solid #eee">${p.locationName}</td></tr>
    <tr><td style="padding:8px;border:1px solid #eee;color:#666">Original Amount</td><td style="padding:8px;border:1px solid #eee">${p.amountStr}</td></tr>
    <tr><td style="padding:8px;border:1px solid #eee;color:#666">Refund Amount</td><td style="padding:8px;border:1px solid #eee;color:#d97706;font-weight:bold">${p.refundStr}</td></tr>
    <tr><td style="padding:8px;border:1px solid #eee;color:#666">Reason</td><td style="padding:8px;border:1px solid #eee">${p.reason}</td></tr>
    <tr><td style="padding:8px;border:1px solid #eee;color:#666">Date</td><td style="padding:8px;border:1px solid #eee">${p.date}</td></tr>
  </table>
  <p>Refunds typically take 3–7 business days to reflect in your account.</p>
  <p style="color:#666;font-size:12px">This is an automated notification. Please do not reply.</p>
</div>`;
}

// avoid unused import warning
import type { ICarBooking } from '../models/CarBooking.js';
