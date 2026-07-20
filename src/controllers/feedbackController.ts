import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { TestDrive } from '../models/TestDrive.js';
import { TestDriveFeedback } from '../models/TestDriveFeedback.js';
import { Customer } from '../models/Customer.js';
import { Vehicle } from '../models/Vehicle.js';
import { Location } from '../models/Location.js';
import { Profile } from '../models/Profile.js';
import { UserRole } from '../models/UserRole.js';
import { sendTransactionalEmail } from '../services/reportEmailService.js';

/**
 * POST /api/public/feedback
 * Public (no auth) — saves test drive feedback and sends email notifications.
 */
export async function submitTestDriveFeedbackController(req: Request, res: Response) {
  try {
    const {
      test_drive_id,
      customer_id,
      enquiry_id,
      customer_name,
      customer_email,
      customer_phone,
      rating,
      experience_badge,
      total_duration_minutes,
      feedback_text,
      would_recommend,
    } = req.body as Record<string, any>;

    if (!test_drive_id || !customer_name || rating == null) {
      return res.status(400).json({ error: 'test_drive_id, customer_name, and rating are required' });
    }

    // Save feedback
    const id = randomUUID();
    const now = new Date().toISOString();
    await TestDriveFeedback.create({
      id,
      test_drive_id,
      customer_id: customer_id || null,
      enquiry_id: enquiry_id || null,
      customer_name,
      customer_email: customer_email || null,
      customer_phone: customer_phone || null,
      rating: Number(rating),
      experience_badge: experience_badge || 'Smooth Experience',
      total_duration_minutes: total_duration_minutes != null ? Number(total_duration_minutes) : null,
      feedback_text: feedback_text || null,
      would_recommend: would_recommend !== false && would_recommend !== 'false',
      created_at: now,
      updated_at: now,
    });

    // Mark feedback_submitted on test drive
    await TestDrive.updateOne({ id: test_drive_id }, { $set: { feedback_submitted: true, updated_at: now } });

    // Fetch related records for emails
    const td = await TestDrive.findOne({ id: test_drive_id }).lean();
    const [vehicle, location, salesProfile] = await Promise.all([
      td?.vehicle_id ? Vehicle.findOne({ id: td.vehicle_id }, { brand: 1, model: 1 }).lean() : null,
      td?.location_id ? Location.findOne({ id: td.location_id }, { name: 1 }).lean() : null,
      td?.assigned_sales_person_id ? Profile.findOne({ id: td.assigned_sales_person_id }, { full_name: 1, email: 1, phone: 1 }).lean() : null,
    ]);

    const vehicleName = vehicle ? `${(vehicle as any).brand} ${(vehicle as any).model}`.trim() : undefined;
    const locationName = (location as any)?.name;
    const salesPersonName = (salesProfile as any)?.full_name;
    const salesPersonPhone = (salesProfile as any)?.phone;
    const submittedAt = new Date(now).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    const sharedData = {
      vehicleName,
      locationName,
      rating: Number(rating),
      experienceBadge: experience_badge,
      feedbackText: feedback_text || '',
      wouldRecommend: would_recommend !== false && would_recommend !== 'false',
      submittedAt,
    };

    // 1. Thank-you email to customer
    if (customer_email) {
      try {
        await sendTransactionalEmail({
          recipientEmail: customer_email,
          templateName: 'test-drive-feedback-thank-you',
          templateData: {
            customerName: customer_name,
            salesPersonName,
            salesPersonPhone,
            ...sharedData,
          },
        });
      } catch (e) {
        console.error('[feedback] customer thank-you email failed:', e);
      }
    }

    // 2. Notify sales person
    if ((salesProfile as any)?.email) {
      try {
        await sendTransactionalEmail({
          recipientEmail: (salesProfile as any).email,
          templateName: 'test-drive-feedback-received',
          templateData: { customerName: customer_name, ...sharedData },
        });
      } catch (e) {
        console.error('[feedback] sales person notification failed:', e);
      }
    }

    // 3. Notify Organization Admins at this location
    if (td?.location_id) {
      const adminRoles = await UserRole.find({ role: { $in: ['dealer_admin', 'sales_admin'] } }, { user_id: 1 }).lean();
      const adminUserIds = adminRoles.map((r: any) => r.user_id).filter(Boolean);
      if (adminUserIds.length > 0) {
        const adminProfiles = await Profile.find(
          { user_id: { $in: adminUserIds }, location_id: td.location_id },
          { email: 1, full_name: 1 },
        ).lean();
        for (const admin of adminProfiles) {
          if (!(admin as any).email || (salesProfile as any)?.email === (admin as any).email) continue;
          try {
            await sendTransactionalEmail({
              recipientEmail: (admin as any).email,
              templateName: 'test-drive-feedback-received',
              templateData: { customerName: customer_name, ...sharedData },
            });
          } catch (e) {
            console.error('[feedback] admin notification failed:', e);
          }
        }
      }
    }

    return res.json({ data: { id, success: true } });
  } catch (err: any) {
    console.error('[feedback] submit error:', err);
    return res.status(500).json({ error: err.message || 'Failed to submit feedback' });
  }
}
