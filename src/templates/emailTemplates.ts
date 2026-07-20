const SITE_NAME = 'Auto Advant';
const AUTOADVANT_URL = 'https://AutoAdvant.com';

/**
 * Branding injected at render time so each dealer gets their own identity in emails.
 * All fields optional — falls back to AutoAdvant defaults.
 */
export interface EmailBranding {
  dealerName?: string;
  dealerLogoUrl?: string;
  primaryColor?: string; // hex e.g. "#18181b"
}

function base(previewText: string, bodyContent: string | EmailBranding = '', branding: EmailBranding = {}): string {
  const effectiveBodyContent = typeof bodyContent === 'string' ? bodyContent : '';
  const effectiveBranding = typeof bodyContent === 'string' ? branding : bodyContent;
  const brand = effectiveBranding.dealerName || SITE_NAME;
  const primaryColor = effectiveBranding.primaryColor || '#18181b';
  const logoUrl = effectiveBranding.dealerLogoUrl;
  const headerContent = logoUrl
    ? `<img src="${logoUrl}" alt="${brand}" style="height:44px;max-width:200px;object-fit:contain;display:block;" />`
    : `<h1 style="margin:0;font-size:20px;font-weight:700;">🚗 ${brand}</h1>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${brand}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #18181b; }
    .container { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .header { background: ${primaryColor}; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 13px; color: #a1a1aa; }
    .body { padding: 28px 32px; }
    .body h2 { margin: 0 0 16px; font-size: 18px; }
    .body p { margin: 0 0 12px; line-height: 1.6; color: #3f3f46; }
    .details { background: #f4f4f5; border-radius: 6px; padding: 16px 20px; margin: 16px 0; }
    .details .row { display: flex; justify-content: space-between; gap: 24px; padding: 8px 0; border-bottom: 1px solid #e4e4e7; font-size: 13px; }
    .details .row:last-child { border-bottom: none; }
    .details .row .label { color: #71717a; white-space: nowrap; }
    .cta { display: inline-block; background: ${primaryColor}; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; margin: 16px 0; }
    .footer { padding: 20px 32px; font-size: 12px; color: #a1a1aa; border-top: 1px solid #f4f4f5; }
    .preview { display: none; font-size: 1px; color: transparent; }
  </style>
</head>
<body>
  <span class="preview">${previewText}</span>
  <div class="container">
    <div class="header">
      ${headerContent}
    </div>
    ${effectiveBodyContent}
    <div class="footer">
      <p>© ${new Date().getFullYear()} ${brand}. All rights reserved.</p>
      <p style="margin-top:4px;">Powered by <a href="${AUTOADVANT_URL}" style="color:#a1a1aa;text-decoration:underline;">AutoAdvant.com</a></p>
    </div>
  </div>
</body>
</html>`;
}

function detailRow(label: string, value: string | undefined | null): string {
  if (!value) return '';
  const displayLabel = label.endsWith(':') ? label : `${label}: `;
  return `<div class="details row"><span class="label">${displayLabel}</span><span>${value}</span></div>`;
}

function extractBranding(data: Record<string, unknown>): EmailBranding {
  return {
    dealerName: data._dealerName as string | undefined,
    dealerLogoUrl: data._dealerLogoUrl as string | undefined,
    primaryColor: data._primaryColor as string | undefined,
  };
}

// ── Templates ────────────────────────────────────────────────────────────────

export function testDriveCompletedTemplate(data: Record<string, unknown>) {
  const { customerName, vehicleName, locationName, scheduledDate, salesPersonName, durationMinutes } = data as Record<string, string | number | undefined>;
  const branding = extractBranding(data);
  return {
    subject: `Your test drive is complete — thank you, ${customerName || 'there'}!`,
    html: base(
      `Your test drive of ${vehicleName || 'a vehicle'} is complete — thank you!`,
      `<div class="body">
        <h2>Test Drive Completed! 🎉</h2>
        <p>Hi ${customerName || 'there'},</p>
        <p>We hope you enjoyed your test drive${vehicleName ? ` of the <strong>${vehicleName}</strong>` : ''}! Your feedback means a lot to us.</p>
        <div class="details">
          ${detailRow('Vehicle', vehicleName as string)}
          ${detailRow('Location', locationName as string)}
          ${detailRow('Date', scheduledDate as string)}
          ${detailRow('Assisted by', salesPersonName as string)}
          ${detailRow('Duration', durationMinutes ? `${durationMinutes} minutes` : undefined)}
        </div>
        <p>Interested in the next step? Our team is ready to help with pricing, financing, or scheduling another test drive.</p>
      </div>`,
      branding,
    ),
    text: `Hi ${customerName || 'there'}, your test drive${vehicleName ? ` of ${vehicleName}` : ''} is complete. Thank you for visiting us!`,
  };
}

export function testDriveRescheduledTemplate(data: Record<string, unknown>) {
  const { customerName, vehicleName, locationName, newDate, newTime } = data as Record<string, string | undefined>;
  const branding = extractBranding(data);
  return {
    subject: `Test drive rescheduled — ${newDate || 'new date confirmed'}`,
    html: base(
      `Your test drive has been rescheduled`,
      `<div class="body">
        <h2>Test Drive Rescheduled</h2>
        <p>Hi ${customerName || 'there'},</p>
        <p>Your test drive has been rescheduled. Here are your updated details:</p>
        <div class="details">
          ${detailRow('Vehicle', vehicleName)}
          ${detailRow('Location', locationName)}
          ${detailRow('New Date', newDate)}
          ${detailRow('New Time', newTime)}
        </div>
        <p>If you have questions or need to make further changes, please contact us.</p>
      </div>`,
      branding,
    ),
    text: `Hi ${customerName || 'there'}, your test drive has been rescheduled to ${newDate} at ${newTime}.`,
  };
}

export function testDriveCancelledTemplate(data: Record<string, unknown>) {
  const { customerName, vehicleName, reason, bookingUrl, manageUrl } = data as Record<string, string | undefined>;
  const branding = extractBranding(data);
  return {
    subject: `Test drive cancellation confirmed`,
    html: base(
      'Your test drive has been cancelled — rebook at your convenience',
      `<div class="body">
        <h2>Test Drive Cancelled</h2>
        <p>Hi ${customerName || 'there'},</p>
        <p>Your test drive${vehicleName ? ` of the <strong>${vehicleName}</strong>` : ''} has been cancelled.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>We'd love to see you again. You can rebook at any time or manage your existing booking using the links below:</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:16px 0;">
          ${bookingUrl ? `<a class="cta" href="${bookingUrl}">Book a Test Drive</a>` : ''}
          ${manageUrl ? `<a class="cta" href="${manageUrl}" style="background:#3f3f46;">Manage My Booking</a>` : ''}
        </div>
        <p style="color:#71717a;font-size:13px;">If you have any questions, simply reply to this email — we're happy to help.</p>
      </div>`,
      branding,
    ),
    text: `Hi ${customerName || 'there'}, your test drive${vehicleName ? ` of ${vehicleName}` : ''} has been cancelled.${bookingUrl ? ` Book again: ${bookingUrl}` : ''}${manageUrl ? ` Manage booking: ${manageUrl}` : ''}`,
  };
}

export function bookingConfirmationTemplate(data: Record<string, unknown>) {
  const { customerName, vehicleName, locationName, scheduledDate, scheduledTime, salesPersonName, manageBookingUrl } = data as Record<string, string | undefined>;
  const branding = extractBranding(data);
  return {
    subject: `Test drive confirmed — ${scheduledDate || 'upcoming'}`,
    html: base(
      `<div class="body">
        <p>Hi ${customerName || 'there'},</p>
        <p>Great news — your test drive is confirmed ✅. We look forward to seeing you!</p>
        <div class="details">
          ${detailRow('Vehicle', vehicleName)}
          ${detailRow('Location', locationName)}
          ${detailRow('Date', scheduledDate)}
          ${detailRow('Time', scheduledTime)}
          ${detailRow('Sales Person', salesPersonName)}
        </div>
        <p>Please bring a valid driving licence. Arrive 10 minutes before your slot.</p>
        ${manageBookingUrl ? `<p style="margin-top:20px;"><a class="cta" href="${manageBookingUrl}">View &amp; Manage Booking</a></p><p style="font-size:13px;color:#71717a;">You can also upload your driving licence from the booking page.</p>` : ''}
      </div>`,
      branding,
    ),
    text: `Hi ${customerName || 'there'}, your test drive is confirmed for ${scheduledDate} at ${scheduledTime}.${manageBookingUrl ? ` Manage booking: ${manageBookingUrl}` : ''}`,
  };
}

export function salesFollowUpTemplate(data: Record<string, unknown>) {
  const { customerName, salesPersonName, vehicleName, followUpNote } = data as Record<string, string | undefined>;
  const branding = extractBranding(data);
  const brandName = branding.dealerName || SITE_NAME;
  return {
    subject: `Follow-up from ${brandName}`,
    html: base(
      `Your ${brandName} sales consultant is following up`,
      `<div class="body">
        <h2>We're following up!</h2>
        <p>Hi ${customerName || 'there'},</p>
        <p>Your ${brandName} consultant${salesPersonName ? ` <strong>${salesPersonName}</strong>` : ''} is following up${vehicleName ? ` regarding the <strong>${vehicleName}</strong>` : ''}.</p>
        ${followUpNote ? `<p>${followUpNote}</p>` : ''}
        <p>Reply to this email or contact us directly — we'd love to help you take the next step.</p>
      </div>`,
      branding,
    ),
    text: `Hi ${customerName || 'there'}, ${salesPersonName || 'your sales consultant'} is following up${vehicleName ? ` about the ${vehicleName}` : ''}.`,
  };
}

export function salesAssignmentTemplate(data: Record<string, unknown>) {
  const { salesPersonName, customerName, vehicleName, scheduledDate, scheduledTime } = data as Record<string, string | undefined>;
  const branding = extractBranding(data);
  return {
    subject: `New test drive assigned — ${customerName}`,
    html: base(
      `You have a new test drive assignment`,
      `<div class="body">
        <h2>New Test Drive Assigned</h2>
        <p>Hi ${salesPersonName || 'there'},</p>
        <p>A test drive has been assigned to you. Please review the details below:</p>
        <div class="details">
          ${detailRow('Customer', customerName)}
          ${detailRow('Vehicle', vehicleName)}
          ${detailRow('Date', scheduledDate)}
          ${detailRow('Time', scheduledTime)}
        </div>
        <p>Please ensure you are available and prepared for this appointment.</p>
      </div>`,
      branding,
    ),
    text: `Hi ${salesPersonName || 'there'}, a test drive with ${customerName} for ${vehicleName} has been assigned to you on ${scheduledDate} at ${scheduledTime}.`,
  };
}

export function testDriveJourneyTemplate(data: Record<string, unknown>) {
  const {
    customerName, vehicleName, locationName, locationAddress, locationPhone,
    scheduledDate, scheduledTime, salesPersonName,
    currentStatus, feedbackLink,
    totalDurationMinutes,
    // legacy fields kept for backwards-compat
    durationMinutes: legacyDuration, startKm, endKm, notes,
  } = data as Record<string, string | number | undefined>;

  const branding = extractBranding(data);
  const duration = totalDurationMinutes ?? legacyDuration;
  const statusLabel = currentStatus ? String(currentStatus).replace(/_/g, ' ') : undefined;

  const STEPS = [
    { icon: '📧', title: 'Booking Confirmation', done: true },
    { icon: '🪪', title: 'Upload Driving Licence', done: true },
    { icon: '🔍', title: 'Licence Verification', done: ['show', 'in_progress', 'completed', 'key_handover_to_sales'].includes(String(currentStatus)) },
    { icon: '🔑', title: 'Key Handover', done: ['in_progress', 'completed', 'key_handover_to_sales'].includes(String(currentStatus)) },
    { icon: '🚗', title: 'Pre-Drive Inspection', done: ['in_progress', 'completed', 'key_handover_to_sales'].includes(String(currentStatus)) },
    { icon: '🏁', title: 'Test Drive', done: ['in_progress', 'completed', 'key_handover_to_sales'].includes(String(currentStatus)) },
    { icon: '🧾', title: 'Post-Drive Inspection', done: ['completed', 'key_handover_to_sales'].includes(String(currentStatus)) },
    { icon: '✅', title: 'Journey Complete', done: ['completed', 'key_handover_to_sales'].includes(String(currentStatus)) },
  ];

  const stepsHtml = STEPS.map(s => `
    <tr>
      <td style="padding:6px 0;vertical-align:middle;">
        <span style="font-size:16px;margin-right:8px;">${s.done ? '✅' : s.icon}</span>
        <span style="font-size:14px;color:${s.done ? '#16a34a' : '#71717a'};${s.done ? '' : 'text-decoration:none;'}">${s.title}</span>
        ${s.done ? `<span style="font-size:11px;color:#16a34a;margin-left:8px;background:#f0fdf4;border-radius:4px;padding:1px 6px;">Done</span>` : ''}
      </td>
    </tr>`).join('');

  return {
    subject: `Your test drive journey summary — ${vehicleName || 'vehicle'}`,
    html: base(
      `Journey summary for your test drive`,
      `<div class="body">
        <h2>Your Test Drive Journey Summary 🗺️</h2>
        <p>Hi ${customerName || 'there'},</p>
        <p>Thank you for visiting us${vehicleName ? ` and experiencing the <strong>${vehicleName}</strong>` : ''}! Here's a full summary of your test drive journey.</p>
        <div class="details">
          ${detailRow('Vehicle', vehicleName as string)}
          ${detailRow('Location', locationName as string)}
          ${locationAddress ? detailRow('Address', locationAddress as string) : ''}
          ${detailRow('Date', scheduledDate as string)}
          ${detailRow('Time', scheduledTime as string)}
          ${detailRow('Your Host', salesPersonName as string)}
          ${statusLabel ? detailRow('Status', statusLabel) : ''}
          ${duration ? detailRow('Time at Showroom', `${duration} minutes`) : ''}
          ${startKm ? detailRow('Start KM', String(startKm)) : ''}
          ${endKm ? detailRow('End KM', String(endKm)) : ''}
          ${notes ? detailRow('Notes', notes as string) : ''}
        </div>

        <h3 style="margin-top:24px;margin-bottom:8px;font-size:15px;color:#18181b;">Journey Steps</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tbody>${stepsHtml}</tbody>
        </table>

        ${feedbackLink ? `
        <div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;text-align:center;">
          <p style="margin:0 0 12px;font-size:14px;color:#3f3f46;">We'd love to hear about your experience!</p>
          <a class="cta" href="${feedbackLink}">Share Your Feedback</a>
        </div>` : ''}

        ${locationPhone ? `<p style="margin-top:16px;font-size:13px;color:#71717a;">Questions? Contact us at ${locationPhone}</p>` : ''}
      </div>`,
      branding,
    ),
    text: `Hi ${customerName || 'there'}, here is your test drive journey summary for ${vehicleName || 'the vehicle'} at ${locationName || 'our showroom'} on ${scheduledDate || ''}.${feedbackLink ? ` Share your feedback: ${feedbackLink}` : ''}`,
  };
}

export function staffWelcomeTemplate(data: Record<string, unknown>) {
  const { fullName, roleLabel, verificationLink, loginUrl } = data as Record<string, string | undefined>;
  const branding = extractBranding(data);
  const brandName = branding.dealerName || SITE_NAME;
  return {
    subject: `Verify your account to sign in`,
    html: base(
      `Welcome to ${brandName} — verify your account`,
      `<div class="body">
        <h2>Welcome to ${brandName}! 👋</h2>
        <p>Hi ${fullName || 'there'},</p>
        <p>Your <strong>${roleLabel || 'staff'}</strong> account has been created. Verify your email to get started:</p>
        ${verificationLink ? `<a class="cta" href="${verificationLink}">Verify My Account</a>` : ''}
        ${loginUrl ? `<p>After verification, sign in at: <a href="${loginUrl}">${loginUrl}</a></p>` : ''}
      </div>`,
      branding,
    ),
    text: `Hi ${fullName || 'there'}, your ${roleLabel || 'staff'} account has been created. Verify your email: ${verificationLink}`,
  };
}

export function vehicleChangeNotificationTemplate(data: Record<string, unknown>) {
  const { customerName, oldVehicle, newVehicle, scheduledDate } = data as Record<string, string | undefined>;
  const branding = extractBranding(data);
  return {
    subject: `Vehicle updated for your test drive`,
    html: base(
      'Your test drive vehicle has been updated',
      `<div class="body">
        <h2>Vehicle Updated</h2>
        <p>Hi ${customerName || 'there'},</p>
        <p>The vehicle for your upcoming test drive has been updated:</p>
        <div class="details">
          ${detailRow('Previous Vehicle', oldVehicle)}
          ${detailRow('New Vehicle', newVehicle)}
          ${detailRow('Date', scheduledDate)}
        </div>
        <p>If you have any questions, please contact us.</p>
      </div>`,
      branding,
    ),
    text: `Hi ${customerName || 'there'}, your test drive vehicle has been updated from ${oldVehicle} to ${newVehicle}.`,
  };
}

export function demoRequestConfirmationTemplate(data: Record<string, unknown>) {
  const { contactName, dealerName } = data as Record<string, string | undefined>;
  const branding = extractBranding(data);
  return {
    subject: `Demo request received — ${SITE_NAME}`,
    html: base(
      'We received your demo request',
      `<div class="body">
        <h2>Demo Request Received ✅</h2>
        <p>Hi ${contactName || 'there'},</p>
        <p>Thank you for your interest in ${SITE_NAME}${dealerName ? ` for <strong>${dealerName}</strong>` : ''}! We've received your demo request and our team will be in touch within 24 hours.</p>
      </div>`,
      branding,
    ),
    text: `Hi ${contactName || 'there'}, we received your demo request and will be in touch within 24 hours.`,
  };
}

// ── Reminder & Re-engagement Templates ───────────────────────────────────────

export function testDriveReminder24hTemplate(data: Record<string, unknown>) {
  const { customerName, vehicleName, locationName, scheduledDate, scheduledTime, salesPersonName } = data as Record<string, string | undefined>;
  const branding = extractBranding(data);
  return {
    subject: `⏰ Your test drive is tomorrow — ${vehicleName || 'get ready!'}`,
    html: base(
      `Your test drive is confirmed for tomorrow!`,
      `<div class="body">
        <h2>Your Test Drive is Tomorrow! 🚗</h2>
        <p>Hi ${customerName || 'there'},</p>
        <p>Just a friendly reminder — your test drive is <strong>tomorrow</strong>. We're looking forward to having you!</p>
        <div class="details">
          ${detailRow('Vehicle', vehicleName)}
          ${detailRow('Location', locationName)}
          ${detailRow('Date', scheduledDate)}
          ${detailRow('Time', scheduledTime)}
          ${detailRow('Your Host', salesPersonName)}
        </div>
        <p><strong>What to bring:</strong> A valid driving licence and your excitement! 🎉</p>
        <p>If you need to reschedule or have any questions, reply to this email or call us before your appointment.</p>
        <p style="color:#71717a;font-size:13px;">See you tomorrow!</p>
      </div>`,
      branding,
    ),
    text: `Hi ${customerName || 'there'}, reminder: your test drive of ${vehicleName || 'the vehicle'} is tomorrow at ${scheduledTime} at ${locationName}. Bring your driving licence.`,
  };
}

export function testDriveReminder4hTemplate(data: Record<string, unknown>) {
  const { customerName, vehicleName, locationName, scheduledDate, scheduledTime, salesPersonName } = data as Record<string, string | undefined>;
  const branding = extractBranding(data);
  return {
    subject: `🚀 See you in ~4 hours — ${vehicleName || 'test drive'} today!`,
    html: base(
      `Your test drive starts in about 4 hours`,
      `<div class="body">
        <h2>Almost Time! Your Test Drive is in ~4 Hours 🔑</h2>
        <p>Hi ${customerName || 'there'},</p>
        <p>Your test drive experience is just a few hours away. Here are the final details:</p>
        <div class="details">
          ${detailRow('Vehicle', vehicleName)}
          ${detailRow('Location', locationName)}
          ${detailRow('Time', scheduledTime)}
          ${detailRow('Your Host', salesPersonName)}
        </div>
        <p>📍 <strong>Pro tip:</strong> Arrive 5 minutes early so we can get started right on time.</p>
        <p>If something has come up, please let us know as soon as possible so we can assist other customers.</p>
      </div>`,
      branding,
    ),
    text: `Hi ${customerName || 'there'}, your test drive of ${vehicleName || 'the vehicle'} at ${locationName} is in about 4 hours (${scheduledTime}). See you soon!`,
  };
}

export function testDriveNoShowReengagementTemplate(data: Record<string, unknown>) {
  const { customerName, vehicleName, locationName, bookingUrl, manageUrl } = data as Record<string, string | undefined>;
  const branding = extractBranding(data);
  return {
    subject: `We missed you today, ${customerName || 'there'} — rebook your test drive 🚗`,
    html: base(
      `We missed you! Rebook your test drive at your convenience.`,
      `<div class="body">
        <h2>We Missed You Today! 😊</h2>
        <p>Hi ${customerName || 'there'},</p>
        <p>It looks like something came up and you couldn't make your test drive${vehicleName ? ` of the <strong>${vehicleName}</strong>` : ''} today${locationName ? ` at ${locationName}` : ''}. No worries at all — life happens!</p>
        <p>The good news? <strong>Your slot is waiting to be rebooked.</strong> We'd love to give you the full experience:</p>
        <ul style="color:#3f3f46;line-height:2;">
          <li>🚗 Experience the ${vehicleName || 'vehicle'} on the road</li>
          <li>🎯 Get personalised guidance from our expert team</li>
          <li>💡 Explore financing & pricing options</li>
          <li>📸 Take it for a proper spin — no pressure!</li>
        </ul>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:16px 0;">
          ${bookingUrl ? `<a class="cta" href="${bookingUrl}">Rebook My Test Drive</a>` : ''}
          ${manageUrl ? `<a class="cta" href="${manageUrl}" style="background:#3f3f46;">Manage My Booking</a>` : ''}
        </div>
        <p>Or simply reply to this email and we'll arrange a time that works perfectly for you.</p>
        <p style="color:#71717a;font-size:13px;">We look forward to meeting you — at your convenience!</p>
      </div>`,
      branding,
    ),
    text: `Hi ${customerName || 'there'}, we missed you today! Please rebook your test drive of ${vehicleName || 'the vehicle'} at your convenience.${bookingUrl ? ` Book here: ${bookingUrl}` : ''}${manageUrl ? ` Manage your booking: ${manageUrl}` : ''}`,
  };
}

export function testDriveThankYouTemplate(data: Record<string, unknown>) {
  const { customerName, vehicleName, locationName, salesPersonName, salesPersonPhone, bookingUrl } = data as Record<string, string | undefined>;
  const branding = extractBranding(data);
  return {
    subject: `Thank you for your test drive, ${customerName || 'there'}! 🎉`,
    html: base(
      `Thank you for visiting us — here's what's next.`,
      `<div class="body">
        <h2>Thank You for Visiting Us! 🙏</h2>
        <p>Hi ${customerName || 'there'},</p>
        <p>We hope you had an amazing time driving the <strong>${vehicleName || 'vehicle'}</strong>${locationName ? ` at ${locationName}` : ''}. It was a pleasure having you with us!</p>
        <p>Here's what you can do next:</p>
        <div class="details">
          <div class="details row" style="display:flex;justify-content:space-between;gap:24px;padding:10px 0;border-bottom:1px solid #e4e4e7;font-size:13px;">
            <span class="label" style="color:#71717a;">💰 Check pricing & offers</span>
            <span>Ask your host for today's deal</span>
          </div>
          <div class="details row" style="display:flex;justify-content:space-between;gap:24px;padding:10px 0;border-bottom:1px solid #e4e4e7;font-size:13px;">
            <span class="label" style="color:#71717a;">🏦 Finance options</span>
            <span>Low EMI, zero-down plans available</span>
          </div>
          <div class="details row" style="display:flex;justify-content:space-between;gap:24px;padding:10px 0;font-size:13px;">
            <span class="label" style="color:#71717a;">🔄 Drive another variant</span>
            <span>Book a follow-up test drive</span>
          </div>
        </div>
        ${salesPersonName ? `<p>Your host <strong>${salesPersonName}</strong>${salesPersonPhone ? ` (${salesPersonPhone})` : ''} is available if you have any questions or want to move forward.</p>` : ''}
        ${bookingUrl ? `<a class="cta" href="${bookingUrl}">Book Another Test Drive</a>` : ''}
        <p style="color:#71717a;font-size:13px;">We'd love to help you find your perfect vehicle. See you again soon! 🚗</p>
      </div>`,
      branding,
    ),
    text: `Hi ${customerName || 'there'}, thank you for your test drive of ${vehicleName || 'the vehicle'}! Your host${salesPersonName ? ` ${salesPersonName}` : ''} is available for follow-up.${bookingUrl ? ` Book again: ${bookingUrl}` : ''}`,
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────

export function testDriveFeedbackReceivedTemplate(data: Record<string, unknown>) {
  const { customerName, vehicleName, locationName, rating, experienceBadge, feedbackText, wouldRecommend, submittedAt } = data as Record<string, string | number | boolean | undefined>;
  const branding = extractBranding(data);
  const stars = '⭐'.repeat(Number(rating) || 0);
  const recommend = wouldRecommend === true || wouldRecommend === 'true' ? '✅ Yes' : '❌ No';
  return {
    subject: `Feedback received from ${customerName || 'customer'} — ${stars} (${rating}/5)`,
    html: base(
      `Customer feedback received`,
      `<div class="body">
        <h2>Customer Feedback Received 📋</h2>
        <p><strong>${customerName || 'A customer'}</strong> has submitted feedback for their test drive${vehicleName ? ` of the <strong>${vehicleName}</strong>` : ''}${locationName ? ` at ${locationName}` : ''}.</p>
        <div class="details">
          ${detailRow('Rating', `${stars} ${rating}/5`)}
          ${experienceBadge ? detailRow('Experience Badge', String(experienceBadge)) : ''}
          ${detailRow('Would Recommend', recommend)}
          ${feedbackText ? detailRow('Feedback', String(feedbackText)) : ''}
          ${submittedAt ? detailRow('Submitted At', String(submittedAt)) : ''}
        </div>
      </div>`,
      branding,
    ),
    text: `${customerName || 'A customer'} submitted feedback: ${rating}/5 stars.${feedbackText ? ` "${feedbackText}"` : ''} Would recommend: ${recommend}.`,
  };
}

export function testDriveFeedbackThankYouTemplate(data: Record<string, unknown>) {
  const { customerName, vehicleName, locationName, rating, salesPersonName, salesPersonPhone } = data as Record<string, string | number | undefined>;
  const branding = extractBranding(data);
  const stars = '⭐'.repeat(Number(rating) || 0);
  return {
    subject: `Thank you for your feedback, ${customerName || 'there'}! ${stars}`,
    html: base(
      `Thank you for sharing your test drive experience`,
      `<div class="body">
        <p>Hi ${customerName || 'there'},</p>
        <p>We really appreciate you taking the time to share your experience${vehicleName ? ` of the <strong>${vehicleName}</strong>` : ''}${locationName ? ` at ${locationName}` : ''}.</p>
        <p>Your rating: <strong>${stars} (${rating}/5)</strong></p>
        <p>Your feedback helps us continuously improve and deliver a better experience for every customer.</p>
        ${salesPersonName ? `<p>Your host <strong>${salesPersonName}</strong>${salesPersonPhone ? ` (${salesPersonPhone})` : ''} will be in touch if you have any further questions about the vehicle or purchase options.</p>` : ''}
        <p style="color:#71717a;font-size:13px;">Thank you for choosing us — we hope to see you again soon! 🚗</p>
      </div>`,
      branding,
    ),
    text: `Hi ${customerName || 'there'}, thank you for your ${rating}/5 star feedback! We appreciate your time and look forward to serving you again.`,
  };
}

type TemplateRenderer = (data: Record<string, unknown>) => { subject: string; html: string; text: string };

export const EMAIL_TEMPLATES: Record<string, TemplateRenderer> = {
  'sales-follow-up': salesFollowUpTemplate,
  'test-drive-journey': testDriveJourneyTemplate,
  'test-drive-completed': testDriveCompletedTemplate,
  'test-drive-rescheduled': testDriveRescheduledTemplate,
  'test-drive-cancelled': testDriveCancelledTemplate,
  'booking-confirmation': bookingConfirmationTemplate,
  'vehicle-change-notification': vehicleChangeNotificationTemplate,
  'staff-welcome': staffWelcomeTemplate,
  'demo-request-confirmation': demoRequestConfirmationTemplate,
  'test-drive-reminder-24h': testDriveReminder24hTemplate,
  'test-drive-reminder-4h': testDriveReminder4hTemplate,
  'test-drive-no-show-reengagement': testDriveNoShowReengagementTemplate,
  'test-drive-thank-you': testDriveThankYouTemplate,
  'test-drive-feedback-received': testDriveFeedbackReceivedTemplate,
  'test-drive-feedback-thank-you': testDriveFeedbackThankYouTemplate,
};

/** Render an email template by name. Throws if template not found. */
export function renderEmailTemplate(
  templateName: string,
  data: Record<string, unknown>,
): { subject: string; html: string; text: string } {
  const renderer = EMAIL_TEMPLATES[templateName];
  if (!renderer) {
    throw new Error(`Unknown email template: ${templateName}`);
  }
  return renderer(data);
}
