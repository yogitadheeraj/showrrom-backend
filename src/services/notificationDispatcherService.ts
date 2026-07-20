/**
 * Unified notification dispatcher.
 *
 * Called non-blocking by testDriveService after every create/update.
 * Loads enabled DealerIntegration records and routes to the appropriate channel adapter.
 *
 * Adapters:
 *  - whatsapp        → WhatsApp Business API (Meta WABA), Twilio, or custom webhook
 *  - sms             → Twilio SMS or custom SMS gateway
 *  - email           → SendGrid or existing SMTP (mailService)
 *  - google_calendar → Google Calendar API (token-based)
 *  - outlook         → Microsoft Graph API (token-based)
 *  - crm             → Arbitrary CRM webhook (POST)
 *  - dms             → Arbitrary DMS webhook (POST)
 */

import { DealerIntegration, IntegrationType } from '../models/DealerIntegration.js';
import { Location } from '../models/Location.js';

// ─── Shared payload type ─────────────────────────────────────────────────────

export type IntegrationEvent =
  | 'test_drive_booked'
  | 'test_drive_confirmed'
  | 'test_drive_cancelled'
  | 'test_drive_completed'
  | 'test_drive_no_show'
  | 'test_drive_in_progress'
  | 'test_drive_rescheduled'
  | 'walkin_registered';

export type IntegrationPayload = {
  event: IntegrationEvent;
  testDriveId: string;
  dealerId?: string;
  locationId: string;
  locationName: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  vehicleName: string;
  scheduledDate: string;
  scheduledTime: string;
  status?: string;
  salesPersonName?: string;
  notes?: string;
};

// ─── Message builders ────────────────────────────────────────────────────────

const EVENT_LABELS: Record<IntegrationEvent, string> = {
  test_drive_booked:      '✅ Test Drive Booked',
  test_drive_confirmed:   '✅ Test Drive Confirmed',
  test_drive_cancelled:   '❌ Test Drive Cancelled',
  test_drive_completed:   '✅ Test Drive Completed',
  test_drive_no_show:     '⚠️ Test Drive No Show',
  test_drive_in_progress: '🚗 Test Drive In Progress',
  test_drive_rescheduled: '🔄 Test Drive Rescheduled',
  walkin_registered:      '👋 Walk-in Registered',
};

function buildWhatsAppMessage(p: IntegrationPayload): string {
  const label = EVENT_LABELS[p.event] ?? p.event.replace(/_/g, ' ');
  return [
    `*${label}*`,
    '',
    `Hi ${p.customerName},`,
    '',
    `🚗 *Vehicle:* ${p.vehicleName}`,
    `📍 *Location:* ${p.locationName}`,
    `📅 *Date:* ${p.scheduledDate}`,
    `⏰ *Time:* ${p.scheduledTime}`,
    p.salesPersonName ? `👤 *Sales Executive:* ${p.salesPersonName}` : '',
    '',
    'Please bring a valid driving licence.',
  ].filter(Boolean).join('\n');
}

function buildSMSMessage(p: IntegrationPayload): string {
  const label = EVENT_LABELS[p.event] ?? p.event.replace(/_/g, ' ');
  return `${label}: ${p.vehicleName} at ${p.locationName} on ${p.scheduledDate} ${p.scheduledTime}.`;
}

function buildEmailHtml(p: IntegrationPayload): string {
  const label = EVENT_LABELS[p.event] ?? p.event.replace(/_/g, ' ');
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:600px">
      <h2 style="margin:0 0 12px">${label}</h2>
      <p>Hi ${p.customerName},</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 8px 4px 0;color:#666">Vehicle</td><td><strong>${p.vehicleName}</strong></td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#666">Location</td><td>${p.locationName}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#666">Date</td><td>${p.scheduledDate}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#666">Time</td><td>${p.scheduledTime}</td></tr>
        ${p.salesPersonName ? `<tr><td style="padding:4px 8px 4px 0;color:#666">Sales Executive</td><td>${p.salesPersonName}</td></tr>` : ''}
      </table>
      <p style="color:#666;font-size:13px;margin-top:16px">Please bring a valid driving licence.</p>
    </div>`;
}

// ─── Channel adapters ────────────────────────────────────────────────────────

async function dispatchWhatsApp(cfg: Record<string, unknown>, p: IntegrationPayload): Promise<void> {
  const phone = p.customerPhone;
  if (!phone) return;
  const message = buildWhatsAppMessage(p);
  const provider = (cfg.provider as string) || 'custom';

  if (provider === 'twilio') {
    const { account_sid, auth_token, from_number } = cfg as Record<string, string>;
    if (!account_sid || !auth_token || !from_number) throw new Error('Twilio WhatsApp: account_sid, auth_token, from_number required');
    const creds = Buffer.from(`${account_sid}:${auth_token}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${account_sid}/Messages.json`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: `whatsapp:${from_number}`, To: `whatsapp:${phone}`, Body: message }),
      },
    );
    if (!res.ok) throw new Error(`Twilio WhatsApp error ${res.status}: ${await res.text()}`);
    return;
  }

  if (provider === 'waba') {
    const { phone_number_id, token } = cfg as Record<string, string>;
    if (!phone_number_id || !token) throw new Error('WABA: phone_number_id and token required');
    const res = await fetch(`https://graph.facebook.com/v18.0/${phone_number_id}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone.replace(/[^0-9]/g, ''),
        type: 'text',
        text: { body: message },
      }),
    });
    if (!res.ok) throw new Error(`WABA error ${res.status}: ${await res.text()}`);
    return;
  }

  // Custom webhook
  const { api_url, token } = cfg as Record<string, string>;
  if (!api_url) throw new Error('WhatsApp custom: api_url required');
  const res = await fetch(api_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ to: phone, message, payload: p }),
  });
  if (!res.ok) throw new Error(`WhatsApp webhook error ${res.status}`);
}

async function dispatchSMS(cfg: Record<string, unknown>, p: IntegrationPayload): Promise<void> {
  const phone = p.customerPhone;
  if (!phone) return;
  const message = buildSMSMessage(p);
  const provider = (cfg.provider as string) || 'custom';

  if (provider === 'twilio') {
    const { account_sid, auth_token, from_number } = cfg as Record<string, string>;
    if (!account_sid || !auth_token || !from_number) throw new Error('Twilio SMS: account_sid, auth_token, from_number required');
    const creds = Buffer.from(`${account_sid}:${auth_token}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${account_sid}/Messages.json`,
      {
        method: 'POST',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: from_number, To: phone, Body: message }),
      },
    );
    if (!res.ok) throw new Error(`Twilio SMS error ${res.status}: ${await res.text()}`);
    return;
  }

  // Custom SMS gateway
  const { api_url, api_key, from } = cfg as Record<string, string>;
  if (!api_url) throw new Error('SMS custom: api_url required');
  const res = await fetch(api_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(api_key ? { Authorization: `Bearer ${api_key}` } : {}) },
    body: JSON.stringify({ to: phone, from, message }),
  });
  if (!res.ok) throw new Error(`SMS gateway error ${res.status}`);
}

async function dispatchEmail(cfg: Record<string, unknown>, p: IntegrationPayload): Promise<void> {
  const email = p.customerEmail;
  if (!email) return;
  const subject = `${EVENT_LABELS[p.event] ?? 'Test Drive Update'} — ${p.vehicleName}`;
  const html = buildEmailHtml(p);
  const provider = (cfg.provider as string) || 'smtp';

  if (provider === 'sendgrid') {
    const { api_key, from_email, from_name } = cfg as Record<string, string>;
    if (!api_key) throw new Error('SendGrid: api_key required');
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: from_email || 'noreply@showroomdrive.com', name: from_name || 'Showroom Drive' },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid error ${res.status}: ${await res.text()}`);
    return;
  }

  // SMTP — delegate to existing mail service
  const { sendMail } = await import('./mailService.js');
  await sendMail({ to: email, subject, html });
}

async function refreshGoogleToken(cfg: Record<string, string>): Promise<string> {
  const { refresh_token, client_id, client_secret } = cfg;
  if (!refresh_token || !client_id || !client_secret) throw new Error('Google Calendar: refresh_token, client_id, client_secret required for token refresh');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id, client_secret }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
  const json = await res.json() as { access_token: string };
  return json.access_token;
}

async function refreshOutlookToken(cfg: Record<string, string>): Promise<string> {
  const { refresh_token, client_id, client_secret, tenant_id = 'common' } = cfg;
  if (!refresh_token || !client_id || !client_secret) throw new Error('Outlook: refresh_token, client_id, client_secret required for token refresh');
  const res = await fetch(`https://login.microsoftonline.com/${tenant_id}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id, client_secret, scope: 'Calendars.ReadWrite offline_access' }),
  });
  if (!res.ok) throw new Error(`Outlook token refresh failed: ${await res.text()}`);
  const json = await res.json() as { access_token: string };
  return json.access_token;
}

async function dispatchGoogleCalendar(cfg: Record<string, unknown>, p: IntegrationPayload): Promise<void> {
  const c = cfg as Record<string, string>;
  if (p.event === 'test_drive_cancelled') return; // deletion needs stored event IDs

  if (!c.refresh_token && !c.access_token) throw new Error('Google Calendar: access_token or refresh_token required');

  // Always prefer a fresh token when refresh_token is available
  let access_token = c.refresh_token
    ? await refreshGoogleToken(c)
    : c.access_token;

  const calendar_id = c.calendar_id || 'primary';
  const start = `${p.scheduledDate}T${p.scheduledTime.substring(0, 5)}:00Z`;
  const endD = new Date(`${p.scheduledDate}T${p.scheduledTime.substring(0, 5)}:00Z`);
  endD.setMinutes(endD.getMinutes() + 30);
  const end = endD.toISOString().substring(0, 19) + 'Z';

  const body = JSON.stringify({
    summary: `Test Drive — ${p.vehicleName} at ${p.locationName}`,
    description: [
      `Customer: ${p.customerName}`,
      `Phone: ${p.customerPhone ?? 'N/A'}`,
      `Vehicle: ${p.vehicleName}`,
      `Location: ${p.locationName}`,
      p.salesPersonName ? `Sales Executive: ${p.salesPersonName}` : '',
    ].filter(Boolean).join('\n'),
    start: { dateTime: start, timeZone: 'UTC' },
    end: { dateTime: end, timeZone: 'UTC' },
    ...{
      attendees: [{ email: 'omnitracely@gmail.com', displayName: 'dheeraj varshney' }],
      guestsCanSeeOtherGuests: false,
      sendUpdates: 'all',
    }})

  let res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar_id)}/events`,
    { method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, body },
  );

  // Token expired mid-session — refresh and retry once
  if (res.status === 401 && c.refresh_token) {
    access_token = await refreshGoogleToken(c);
    res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar_id)}/events`,
      { method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, body },
    );
  }

  if (!res.ok) throw new Error(`Google Calendar error ${res.status}: ${await res.text()}`);
}

async function dispatchOutlook(cfg: Record<string, unknown>, p: IntegrationPayload): Promise<void> {
  const c = cfg as Record<string, string>;
  if (p.event === 'test_drive_cancelled') return;

  if (!c.refresh_token && !c.access_token) throw new Error('Outlook: access_token or refresh_token required');

  // Always prefer a fresh token when refresh_token is available
  let access_token = c.refresh_token
    ? await refreshOutlookToken(c)
    : c.access_token;

  const calendar_id = c.calendar_id;
  const start = `${p.scheduledDate}T${p.scheduledTime.substring(0, 5)}:00Z`;
  const endD = new Date(`${p.scheduledDate}T${p.scheduledTime.substring(0, 5)}:00Z`);
  endD.setMinutes(endD.getMinutes() + 30);
  const end = endD.toISOString().substring(0, 19) + 'Z';
  const url = calendar_id
    ? `https://graph.microsoft.com/v1.0/me/calendars/${calendar_id}/events`
    : 'https://graph.microsoft.com/v1.0/me/events';

  const body = JSON.stringify({
    subject: `Test Drive — ${p.vehicleName} at ${p.locationName}`,
    body: {
      contentType: 'HTML',
      content: [
        `<b>Customer:</b> ${p.customerName}`,
        `<b>Phone:</b> ${p.customerPhone ?? 'N/A'}`,
        `<b>Vehicle:</b> ${p.vehicleName}`,
        `<b>Location:</b> ${p.locationName}`,
        p.salesPersonName ? `<b>Sales Executive:</b> ${p.salesPersonName}` : '',
      ].filter(Boolean).join('<br>'),
    },
    start: { dateTime: start, timeZone: 'UTC' },
    end: { dateTime: end, timeZone: 'UTC' },
    ...(p.customerEmail ? {
      attendees: [{
        emailAddress: { address: p.customerEmail, name: p.customerName },
        type: 'required',
      }],
      isOnlineMeeting: false,
    } : {}),
  });

  let res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body,
  });

  // Token expired mid-session — refresh and retry once
  if (res.status === 401 && c.refresh_token) {
    access_token = await refreshOutlookToken(c);
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body,
    });
  }

  if (!res.ok) throw new Error(`Outlook error ${res.status}: ${await res.text()}`);
}

async function dispatchWebhook(label: string, cfg: Record<string, unknown>, p: IntegrationPayload): Promise<void> {
  const { webhook_url, api_key, secret_header, secret_value } = cfg as Record<string, string>;
  if (!webhook_url) throw new Error(`${label}: webhook_url required`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (api_key) headers['Authorization'] = `Bearer ${api_key}`;
  if (secret_header && secret_value) headers[secret_header] = secret_value;

  const res = await fetch(webhook_url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      event: p.event,
      test_drive_id: p.testDriveId,
      customer: {
        name: p.customerName,
        phone: p.customerPhone,
        email: p.customerEmail,
        id: p.customerId,
      },
      vehicle: p.vehicleName,
      location: { id: p.locationId, name: p.locationName },
      scheduled_date: p.scheduledDate,
      scheduled_time: p.scheduledTime,
      status: p.status,
      sales_person: p.salesPersonName,
      timestamp: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`${label} webhook error ${res.status}`);
}

// ─── Main dispatcher ─────────────────────────────────────────────────────────

export async function dispatchNotification(payload: IntegrationPayload): Promise<void> {
  try {
    let dealerId = payload.dealerId;
    if (!dealerId) {
      const loc = await Location.findOne({ id: payload.locationId }, { dealer_id: 1 }).lean() as any;
      dealerId = loc?.dealer_id ?? undefined;
    }
    if (!dealerId) return;

    const integrations = await DealerIntegration.find({ dealer_id: dealerId, is_enabled: true }).lean() as any[];
    if (!integrations.length) return;

    await Promise.allSettled(
      integrations
        .filter(i => !i.events?.length || (i.events as string[]).includes(payload.event))
        .map(async (i) => {
          try {
            const cfg = (i.config ?? {}) as Record<string, unknown>;
            switch (i.type as IntegrationType) {
              case 'whatsapp':        await dispatchWhatsApp(cfg, payload); break;
              case 'sms':             await dispatchSMS(cfg, payload); break;
              case 'email':           await dispatchEmail(cfg, payload); break;
              case 'google_calendar': await dispatchGoogleCalendar(cfg, payload); break;
              case 'outlook':         await dispatchOutlook(cfg, payload); break;
              case 'crm':             await dispatchWebhook('CRM', cfg, payload); break;
              case 'dms':             await dispatchWebhook('DMS', cfg, payload); break;
            }
          } catch (err) {
            console.error(`[integration:${i.type}] dispatch failed:`, (err as Error).message);
          }
        }),
    );
  } catch (err) {
    console.error('[notificationDispatcher] error:', (err as Error).message);
  }
}

/**
 * Fire a test dispatch for a single integration record (used by the test-connection endpoint).
 */
export async function testIntegrationDispatch(
  type: IntegrationType,
  cfg: Record<string, unknown>,
  samplePayload: IntegrationPayload,
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (type) {
      case 'whatsapp':        await dispatchWhatsApp(cfg, samplePayload); break;
      case 'sms':             await dispatchSMS(cfg, samplePayload); break;
      case 'email':           await dispatchEmail(cfg, samplePayload); break;
      case 'google_calendar': await dispatchGoogleCalendar(cfg, samplePayload); break;
      case 'outlook':         await dispatchOutlook(cfg, samplePayload); break;
      case 'crm':             await dispatchWebhook('CRM', cfg, samplePayload); break;
      case 'dms':             await dispatchWebhook('DMS', cfg, samplePayload); break;
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
