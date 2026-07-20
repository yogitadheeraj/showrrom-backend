import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Request, Response } from 'express';
import { TestDrive } from '../models/TestDrive.js';
import { Customer } from '../models/Customer.js';
import { Vehicle } from '../models/Vehicle.js';
import { Location } from '../models/Location.js';
import { Profile } from '../models/Profile.js';
import { Notification } from '../models/Notification.js';
import { saveFile } from '../services/storageService.js';
import { sendMail } from '../services/mailService.js';
import { env } from '../config/env.js';
import { createPublicTestDrive, updateTestDrive } from '../services/testDriveService.js';

// ─── Token helpers ────────────────────────────────────────────────────────────

export function generateBookingToken(testDriveId: string): string {
  return createHmac('sha256', env.oauthStateSecret)
    .update(`booking:${testDriveId}`)
    .digest('hex');
}

function verifyBookingToken(testDriveId: string, token: string): boolean {
  try {
    const expected = generateBookingToken(testDriveId);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(token, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function getToken(req: Request): string {
  return String(req.query.token || req.body?.token || '');
}

// ─── GET /api/customer/booking/:testDriveId ───────────────────────────────────

export async function getCustomerBookingController(req: Request, res: Response) {
  const { testDriveId } = req.params;
  const token = getToken(req);

  if (!token || !verifyBookingToken(testDriveId, token)) {
    res.status(403).json({ data: null, error: { message: 'Invalid or missing booking token.' } });
    return;
  }

  const td = await TestDrive.findOne({ id: testDriveId }).lean() as any;
  if (!td) {
    res.status(404).json({ data: null, error: { message: 'Booking not found.' } });
    return;
  }
  delete td._id;

  const [customer, vehicle, location] = await Promise.all([
    td.customer_id
      ? Customer.findOne({ id: td.customer_id }, { id: 1, full_name: 1, email: 1, phone: 1, driving_license_url: 1, driving_license_verified: 1 }).lean()
      : null,
    td.vehicle_id
      ? Vehicle.findOne({ id: td.vehicle_id }, { id: 1, brand: 1, model: 1, variant: 1, image_url: 1 }).lean()
      : null,
    td.location_id
      ? Location.findOne({ id: td.location_id }, { id: 1, name: 1, city: 1, address: 1, latitude: 1, longitude: 1 }).lean()
      : null,
  ]);

  res.json({
    data: {
      test_drive: td,
      customer: customer ? { ...customer, _id: undefined } : null,
      vehicle: vehicle ? { ...vehicle, _id: undefined } : null,
      location: location ? { ...location, _id: undefined } : null,
    },
    error: null,
  });
}

// ─── POST /api/customer/booking/:testDriveId/cancel ───────────────────────────

export async function cancelCustomerBookingController(req: Request, res: Response) {
  const { testDriveId } = req.params;
  const token = getToken(req);

  if (!token || !verifyBookingToken(testDriveId, token)) {
    res.status(403).json({ data: null, error: { message: 'Invalid or missing booking token.' } });
    return;
  }

  const td = await TestDrive.findOne({ id: testDriveId }).lean() as any;
  if (!td) {
    res.status(404).json({ data: null, error: { message: 'Booking not found.' } });
    return;
  }

  if (td.status === 'cancelled' || td.status === 'completed') {
    res.status(400).json({ data: null, error: { message: `Cannot cancel a ${td.status} booking.` } });
    return;
  }

  const reason = String(req.body?.reason || 'Cancelled by customer');

  // Use updateTestDrive so afterStatusChange fires and sends cancellation email
  await updateTestDrive(testDriveId, {
    status: 'cancelled',
    cancelled_reason: reason,
    cancellation_reason: reason,
  });

  res.json({ data: { success: true }, error: null });
}

// ─── POST /api/customer/booking/:testDriveId/reschedule ───────────────────────

export async function rescheduleCustomerBookingController(req: Request, res: Response) {
  const { testDriveId } = req.params;
  const token = getToken(req);

  if (!token || !verifyBookingToken(testDriveId, token)) {
    res.status(403).json({ data: null, error: { message: 'Invalid or missing booking token.' } });
    return;
  }

  const { scheduled_date, scheduled_time } = req.body || {};
  if (!scheduled_date || !scheduled_time) {
    res.status(400).json({ data: null, error: { message: 'scheduled_date and scheduled_time are required.' } });
    return;
  }

  const td = await TestDrive.findOne({ id: testDriveId }).lean() as any;
  if (!td) {
    res.status(404).json({ data: null, error: { message: 'Booking not found.' } });
    return;
  }

  if (td.status === 'cancelled' || td.status === 'completed') {
    res.status(400).json({ data: null, error: { message: `Cannot reschedule a ${td.status} booking.` } });
    return;
  }

  // Use updateTestDrive so afterStatusChange fires and sends reschedule email
  await updateTestDrive(testDriveId, {
    scheduled_date: String(scheduled_date),
    scheduled_time: String(scheduled_time),
    status: 'rescheduled',
  });

  res.json({ data: { success: true }, error: null });
}

// ─── POST /api/customer/booking/:testDriveId/documents ────────────────────────

export async function uploadCustomerDocumentController(req: Request, res: Response) {
  const { testDriveId } = req.params;
  const token = getToken(req);

  if (!token || !verifyBookingToken(testDriveId, token)) {
    res.status(403).json({ data: null, error: { message: 'Invalid or missing booking token.' } });
    return;
  }

  if (!req.file) {
    res.status(400).json({ data: null, error: { message: 'File is required.' } });
    return;
  }

  const td = await TestDrive.findOne({ id: testDriveId }, { id: 1, customer_id: 1 }).lean() as any;
  if (!td) {
    res.status(404).json({ data: null, error: { message: 'Booking not found.' } });
    return;
  }

  const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
  const allowedExts = ['jpg', 'jpeg', 'png', 'pdf', 'webp'];
  if (!allowedExts.includes(ext)) {
    res.status(400).json({ data: null, error: { message: 'Only JPG, PNG, PDF and WebP files are allowed.' } });
    return;
  }

  const fileName = `dl_${td.customer_id}_${Date.now()}.${ext}`;
  const saved = await saveFile('documents', fileName, req.file, true);

  const fileUrl = `${env.publicApiUrl}/api/storage/documents/${encodeURIComponent(saved.path)}`;

  await Customer.findOneAndUpdate(
    { id: td.customer_id },
    { $set: { driving_license_url: fileUrl, updated_at: new Date().toISOString() } },
  );

  // Non-blocking: notify customer + sales person
  void notifyLicenseUploaded(td.id, td.customer_id, fileUrl).catch((err: any) => {
    console.error('[license] notification error:', err?.message);
  });

  res.json({ data: { url: fileUrl, path: saved.path }, error: null });
}

// ─── POST /api/customer/booking/:testDriveId/rebook ───────────────────────────
// Re-create a new booking for the same customer + vehicle + location.
// Requires the original booking to be cancelled (or completed).

export async function rebookCustomerController(req: Request, res: Response) {
  const { testDriveId } = req.params;
  const token = getToken(req);

  if (!token || !verifyBookingToken(testDriveId, token)) {
    res.status(403).json({ data: null, error: { message: 'Invalid or missing booking token.' } });
    return;
  }

  const { scheduled_date, scheduled_time, slot_duration_minutes } = req.body || {};
  if (!scheduled_date || !scheduled_time) {
    res.status(400).json({ data: null, error: { message: 'scheduled_date and scheduled_time are required.' } });
    return;
  }

  const td = await TestDrive.findOne({ id: testDriveId }).lean() as any;
  if (!td) {
    res.status(404).json({ data: null, error: { message: 'Original booking not found.' } });
    return;
  }

  const customer = await Customer.findOne(
    { id: td.customer_id },
    { full_name: 1, phone: 1, email: 1 },
  ).lean() as any;

  if (!customer) {
    res.status(404).json({ data: null, error: { message: 'Customer record not found.' } });
    return;
  }

  try {
    const newTd = await createPublicTestDrive({
      full_name: customer.full_name,
      phone: customer.phone,
      email: customer.email ?? null,
      vehicle_id: td.vehicle_id,
      location_id: td.location_id,
      scheduled_date: String(scheduled_date),
      scheduled_time: String(scheduled_time),
      slot_duration_minutes: typeof slot_duration_minutes === 'number' ? slot_duration_minutes : (td.slot_duration_minutes ?? 30),
    });

    const newToken = generateBookingToken(newTd.id);
    const manageUrl = `${env.publicFrontendUrl}/customer/booking/${newTd.id}?token=${newToken}`;

    res.status(201).json({ data: { test_drive: newTd, token: newToken, manage_url: manageUrl }, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Booking failed';
    res.status(400).json({ data: null, error: { message } });
  }
}

// ─── Shared: notify customer + sales person when DL is uploaded ───────────────

export async function notifyLicenseUploaded(testDriveId: string, customerId: string, fileUrl: string) {
  const [td, customer] = await Promise.all([
    TestDrive.findOne({ id: testDriveId }, { assigned_sales_person_id: 1, scheduled_date: 1, scheduled_time: 1, vehicle_id: 1, location_id: 1 }).lean(),
    Customer.findOne({ id: customerId }, { full_name: 1, email: 1 }).lean(),
  ]);

  const c = customer as any;
  const t = td as any;
  const customerName = c?.full_name || 'Customer';
  const scheduledDate = t?.scheduled_date || '';
  const scheduledTime = t?.scheduled_time ? (t.scheduled_time as string).substring(0, 5) : '';
  const dateLabel = scheduledTime ? `${scheduledDate} at ${scheduledTime}` : scheduledDate;

  // ── 1. Email to customer ──────────────────────────────────────────────────
  if (c?.email) {
    await sendMail({
      to: c.email,
      subject: 'Driving licence uploaded — ready for your test drive',
      html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="background:#18181b;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0">✅ Driving Licence Received</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p>Hi <strong>${customerName}</strong>,</p>
    <p>Your driving licence has been uploaded successfully. Our team will verify it before your test drive.</p>
    ${dateLabel ? `<p style="margin-top:12px">📅 <strong>Test Drive:</strong> ${dateLabel}</p>` : ''}
    <p style="margin-top:20px;color:#6b7280;font-size:13px;">If you did not upload this document or have any concerns, please contact us immediately.</p>
  </div>
</div>`,
    }).catch((err: any) => console.error('[license] customer email failed:', err?.message));
  }

  // ── 2. In-app + email notification to assigned sales person ──────────────
  if (!t?.assigned_sales_person_id) return;

  const salesProfile = await Profile.findOne(
    { id: t.assigned_sales_person_id },
    { user_id: 1, full_name: 1, email: 1 },
  ).lean() as any;

  if (!salesProfile) return;

  const now = new Date().toISOString();

  // In-app notification
  if (salesProfile.user_id) {
    await Notification.create({
      id: randomUUID(),
      user_id: salesProfile.user_id,
      profile_id: salesProfile.id || null,
      location_id: t.location_id || null,
      title: 'Driving Licence Uploaded',
      body: `${customerName} has uploaded their driving licence for the test drive${dateLabel ? ` on ${dateLabel}` : ''}.`,
      type: 'driving_license_uploaded',
      reference_id: testDriveId,
      reference_type: 'test_drive',
      is_read: false,
      read_at: null,
      metadata: { test_drive_id: testDriveId, customer_id: customerId, customer_name: customerName },
      created_at: now,
    });
  }

  // Email to sales person
  if (salesProfile.email) {
    await sendMail({
      to: salesProfile.email,
      subject: `Driving licence uploaded — ${customerName}`,
      html: `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="background:#18181b;padding:20px 24px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0">📄 Driving Licence Uploaded</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p>Hi <strong>${salesProfile.full_name || 'Team'}</strong>,</p>
    <p><strong>${customerName}</strong> has uploaded their driving licence and it is ready for verification.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;width:40%;font-size:13px">Customer</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600">${customerName}</td></tr>
      ${dateLabel ? `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;font-size:13px">Test Drive</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#2563eb;font-weight:600">${dateLabel}</td></tr>` : ''}
    </table>
    <p style="color:#6b7280;font-size:11px;margin-top:16px">Test Drive ID: ${testDriveId} · AutoAdvant automated notification</p>
  </div>
</div>`,
    }).catch((err: any) => console.error('[license] sales email failed:', err?.message));
  }
}
