import { randomUUID } from 'node:crypto';
import { TestDrive } from '../models/TestDrive.js';
import { Profile } from '../models/Profile.js';
import { Location } from '../models/Location.js';
import { Dealer } from '../models/Dealer.js';
import { StaffActivityEvent } from '../models/StaffActivityEvent.js';
import { DailyTestDriveReport } from '../models/DailyTestDriveReport.js';
import { enqueueEmail } from './emailQueueService.js';
import { sendMail } from './mailService.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface TestDriveStats {
  scheduled: number; confirmed: number; show: number; no_show: number;
  in_progress: number; completed: number; cancelled: number; rescheduled: number;
}

interface SalesPersonData { id: string; name: string; assigned: number; completed: number; no_show: number; }
interface SecurityData { id: string; name: string; checked_in: number; checked_out: number; }
interface GROData { id: string; name: string; assigned: number; completed: number; }

interface ReportData {
  dealer: { id: string; name: string; email: string };
  location: { id: string; name: string };
  reportDate: string;
  totalTestDrives: number;
  statusBreakdown: TestDriveStats;
  salesPeople: SalesPersonData[];
  security: SecurityData[];
  gro: GROData[];
  activitySummary: {
    totalEvents: number;
    eventTypes: Record<string, number>;
    roleActivity: Record<string, { events: number; sessions: number }>;
  };
}

// ── HTML Report Generator ─────────────────────────────────────────────────────

function generateReportHTML(report: ReportData): string {
  const dateFormatted = new Date(report.reportDate).toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const statusColors: Record<string, string> = {
    scheduled: '#3b82f6', confirmed: '#8b5cf6', show: '#10b981',
    no_show: '#ef4444', in_progress: '#f59e0b', completed: '#06b6d4',
    cancelled: '#6b7280', rescheduled: '#ec4899',
  };

  const total = report.totalTestDrives || 1;
  const statusChart = Object.entries(report.statusBreakdown)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => {
      const w = Math.max(Math.round((count / total) * 100), 5);
      return `<div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-size:13px;font-weight:500;text-transform:capitalize;">${status.replace(/_/g, ' ')}</span>
          <span style="font-size:13px;font-weight:600;">${count}</span>
        </div>
        <div style="height:20px;background:#f3f4f6;border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${w}%;background:${statusColors[status] || '#9ca3af'};"></div>
        </div>
      </div>`;
    }).join('');

  const salesRows = report.salesPeople.map(p =>
    `<tr><td style="padding:10px;font-size:13px;">${p.name}</td>
     <td style="padding:10px;text-align:center;font-size:13px;">${p.assigned}</td>
     <td style="padding:10px;text-align:center;font-size:13px;color:#10b981;font-weight:600;">${p.completed}</td>
     <td style="padding:10px;text-align:center;font-size:13px;color:#ef4444;">${p.no_show}</td></tr>`,
  ).join('');

  const secRows = report.security.map(p =>
    `<tr><td style="padding:10px;font-size:13px;">${p.name}</td>
     <td style="padding:10px;text-align:center;font-size:13px;">${p.checked_in}</td>
     <td style="padding:10px;text-align:center;font-size:13px;">${p.checked_out}</td></tr>`,
  ).join('');

  const groRows = report.gro.map(p =>
    `<tr><td style="padding:10px;font-size:13px;">${p.name}</td>
     <td style="padding:10px;text-align:center;font-size:13px;">${p.assigned}</td>
     <td style="padding:10px;text-align:center;font-size:13px;">${p.completed}</td></tr>`,
  ).join('');

  const activityRows = Object.entries(report.activitySummary.eventTypes).map(([type, count]) =>
    `<tr><td style="padding:8px;font-size:13px;">${type}</td>
     <td style="padding:8px;text-align:center;font-size:13px;font-weight:600;">${count}</td></tr>`,
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937;line-height:1.6;}
  .wrap{max-width:900px;margin:0 auto;padding:20px;}
  .hdr{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:24px;border-radius:8px;margin-bottom:24px;text-align:center;}
  .hdr h1{margin:0;font-size:24px;font-weight:700;}
  .hdr p{margin:8px 0 0;opacity:.9;}
  .sec{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:20px;}
  .stitle{font-size:16px;font-weight:700;margin-bottom:16px;border-bottom:2px solid #f3f4f6;padding-bottom:12px;}
  .sbox{display:inline-block;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;margin:0 12px 12px 0;}
  .sv{font-size:20px;font-weight:700;color:#667eea;}
  .sl{font-size:12px;color:#6b7280;margin-top:4px;}
  table{width:100%;border-collapse:collapse;}
  th{background:#f3f4f6;padding:12px;text-align:left;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;}
  .footer{background:#f9fafb;padding:16px;border-radius:6px;margin-top:20px;font-size:12px;color:#6b7280;text-align:center;}
</style></head><body>
<div class="wrap">
  <div class="hdr">
    <h1>📊 Daily Test Drive Report</h1>
    <p>${report.location.name} | ${dateFormatted}</p>
  </div>
  <div class="sec">
    <div class="stitle">📈 Overview</div>
    <div>
      <div class="sbox"><div class="sv">${report.totalTestDrives}</div><div class="sl">Total Test Drives</div></div>
      <div class="sbox"><div class="sv" style="color:#10b981;">${report.statusBreakdown.completed}</div><div class="sl">Completed</div></div>
      <div class="sbox"><div class="sv" style="color:#ef4444;">${report.statusBreakdown.no_show}</div><div class="sl">No Show</div></div>
      <div class="sbox"><div class="sv" style="color:#f59e0b;">${report.statusBreakdown.in_progress}</div><div class="sl">In Progress</div></div>
    </div>
  </div>
  <div class="sec">
    <div class="stitle">🎯 Status Breakdown</div>
    ${statusChart || '<p style="color:#6b7280;">No test drives recorded.</p>'}
  </div>
  ${salesRows ? `<div class="sec">
    <div class="stitle">👤 Sales Team Performance</div>
    <table><thead><tr><th>Sales Person</th><th style="text-align:center;">Assigned</th><th style="text-align:center;">Completed</th><th style="text-align:center;">No Show</th></tr></thead>
    <tbody>${salesRows}</tbody></table></div>` : ''}
  ${secRows ? `<div class="sec">
    <div class="stitle">🛡️ Security Activity</div>
    <table><thead><tr><th>Staff</th><th style="text-align:center;">Checked In</th><th style="text-align:center;">Checked Out</th></tr></thead>
    <tbody>${secRows}</tbody></table></div>` : ''}
  ${groRows ? `<div class="sec">
    <div class="stitle">👥 GRO Activity</div>
    <table><thead><tr><th>GRO</th><th style="text-align:center;">Assigned</th><th style="text-align:center;">Completed</th></tr></thead>
    <tbody>${groRows}</tbody></table></div>` : ''}
  ${activityRows ? `<div class="sec">
    <div class="stitle">📋 Activity Events</div>
    <p>Total events: <strong>${report.activitySummary.totalEvents}</strong></p>
    <table><thead><tr><th>Event Type</th><th style="text-align:center;">Count</th></tr></thead>
    <tbody>${activityRows}</tbody></table></div>` : ''}
  <div class="footer">Generated on ${new Date().toISOString()} | Auto Advant</div>
</div></body></html>`;
}

// ── Report Data Builder ───────────────────────────────────────────────────────

async function buildReportData(locationId: string, reportDate: string): Promise<ReportData | null> {
  const location = await Location.findOne({ id: locationId }).lean();
  if (!location) return null;

  const dealer = location.dealer_id
    ? await Dealer.findOne({ id: location.dealer_id }).lean()
    : null;

  const drives = await TestDrive.find({ location_id: locationId, scheduled_date: reportDate }).lean();

  const zeroStats: TestDriveStats = {
    scheduled: 0, confirmed: 0, show: 0, no_show: 0,
    in_progress: 0, completed: 0, cancelled: 0, rescheduled: 0,
  };
  const statusBreakdown = drives.reduce((acc, d) => {
    const s = d.status as keyof TestDriveStats;
    if (s in acc) acc[s]++;
    return acc;
  }, { ...zeroStats });

  // Sales people
  const salesMap = new Map<string, SalesPersonData>();
  for (const d of drives) {
    if (!d.assigned_sales_person_id) continue;
    const sid = d.assigned_sales_person_id;
    if (!salesMap.has(sid)) {
      const p = await Profile.findOne({ user_id: sid }).lean();
      salesMap.set(sid, { id: sid, name: p?.full_name || sid, assigned: 0, completed: 0, no_show: 0 });
    }
    const entry = salesMap.get(sid)!;
    entry.assigned++;
    if (d.status === 'completed') entry.completed++;
    if (d.status === 'no_show') entry.no_show++;
  }

  // Security
  const secMap = new Map<string, SecurityData>();
  for (const d of drives) {
    if (!d.security_checked_in_at) continue;
    // Infer security from notes/metadata if available — fall back to placeholder
    const sid = (d.metadata as Record<string, unknown>)?.security_profile_id as string | undefined;
    if (!sid) continue;
    if (!secMap.has(sid)) {
      const p = await Profile.findOne({ user_id: sid }).lean();
      secMap.set(sid, { id: sid, name: p?.full_name || sid, checked_in: 0, checked_out: 0 });
    }
    const entry = secMap.get(sid)!;
    entry.checked_in++;
    if (d.security_checked_out_at) entry.checked_out++;
  }

  // GRO
  const groMap = new Map<string, GROData>();
  for (const d of drives) {
    const gid = d.assigned_gro_id || d.gro_id;
    if (!gid) continue;
    if (!groMap.has(gid)) {
      const p = await Profile.findOne({ user_id: gid }).lean();
      groMap.set(gid, { id: gid, name: p?.full_name || gid, assigned: 0, completed: 0 });
    }
    const entry = groMap.get(gid)!;
    entry.assigned++;
    if (d.status === 'completed') entry.completed++;
  }

  // Activity events
  const events = await StaffActivityEvent.find({
    location_id: locationId,
    happened_at: { $gte: `${reportDate}T00:00:00`, $lte: `${reportDate}T23:59:59` },
  }).lean();

  const eventTypes: Record<string, number> = {};
  const roleActivity: Record<string, { events: number; sessions: number }> = {};
  for (const e of events) {
    eventTypes[e.event_type] = (eventTypes[e.event_type] || 0) + 1;
    if (e.role) {
      if (!roleActivity[e.role]) roleActivity[e.role] = { events: 0, sessions: 0 };
      roleActivity[e.role].events++;
    }
  }

  return {
    dealer: { id: dealer?.id || '', name: dealer?.name || '', email: dealer?.contact_email || '' },
    location: { id: location.id, name: location.name },
    reportDate,
    totalTestDrives: drives.length,
    statusBreakdown,
    salesPeople: Array.from(salesMap.values()),
    security: Array.from(secMap.values()),
    gro: Array.from(groMap.values()),
    activitySummary: { totalEvents: events.length, eventTypes, roleActivity },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendDailyTestDriveReports(options: {
  reportDate?: string;
  locationIds?: string[];
} = {}): Promise<{ queued: number; errors: string[] }> {
  const reportDate = options.reportDate || new Date().toISOString().split('T')[0];

  let locations;
  if (options.locationIds?.length) {
    locations = await Location.find({ id: { $in: options.locationIds }, is_active: true }).lean();
  } else {
    locations = await Location.find({ is_active: true }).lean();
  }

  let queued = 0;
  const errors: string[] = [];

  for (const loc of locations) {
    if (!loc.email) continue;

    // Upsert report record
    const reportId = randomUUID();
    try {
      await DailyTestDriveReport.findOneAndUpdate(
        { location_id: loc.id, report_date: reportDate, report_type: 'test_drive_daily' },
        {
          $setOnInsert: { id: reportId, recipient_email: loc.email, created_at: new Date() },
          $inc: { attempts: 1 },
          $set: { last_attempt_at: new Date(), status: 'pending' },
        },
        { upsert: true },
      );

      const data = await buildReportData(loc.id, reportDate);
      if (!data) {
        await DailyTestDriveReport.updateOne(
          { location_id: loc.id, report_date: reportDate, report_type: 'test_drive_daily' },
          { $set: { status: 'failed', error_message: 'Location data not found' } },
        );
        continue;
      }

      const html = generateReportHTML(data);
      const subject = `Daily Test Drive Report — ${loc.name} — ${reportDate}`;

      await enqueueEmail('transactional_emails', {
        to: loc.email,
        subject,
        html,
        text: `Daily test drive report for ${loc.name} on ${reportDate}. Total: ${data.totalTestDrives} drives.`,
        label: 'daily_test_drive_report',
      });

      await DailyTestDriveReport.updateOne(
        { location_id: loc.id, report_date: reportDate, report_type: 'test_drive_daily' },
        { $set: { status: 'sent', sent_at: new Date() } },
      );

      queued++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${loc.id}: ${msg}`);
      await DailyTestDriveReport.updateOne(
        { location_id: loc.id, report_date: reportDate, report_type: 'test_drive_daily' },
        { $set: { status: 'failed', error_message: msg.slice(0, 500) } },
      );
    }
  }

  return { queued, errors };
}

export async function sendDailyActivityReports(options: {
  reportDate?: string;
  locationIds?: string[];
} = {}): Promise<{ queued: number; errors: string[] }> {
  // Reuse test drive report data but focus on activity summary
  return sendDailyTestDriveReports({ ...options });
}

export async function logReportSendAttempt(args: {
  reportId: string;
  status: 'sent' | 'failed';
  errorMessage?: string;
}): Promise<void> {
  const update: Record<string, unknown> = {
    last_attempt_at: new Date(),
    status: args.status,
  };
  if (args.errorMessage) update.error_message = args.errorMessage.slice(0, 500);
  if (args.status === 'sent') update.sent_at = new Date();

  await DailyTestDriveReport.updateOne({ id: args.reportId }, { $set: update, $inc: { attempts: 1 } });
}

export async function retryFailedReports(): Promise<{ retried: number }> {
  const failedReports = await DailyTestDriveReport.find({
    status: 'failed',
    attempts: { $lt: 3 },
  }).lean();

  let retried = 0;
  for (const report of failedReports) {
    try {
      await sendDailyTestDriveReports({
        reportDate: report.report_date,
        locationIds: [report.location_id],
      });
      retried++;
    } catch {
      // Logged inside sendDailyTestDriveReports
    }
  }
  return { retried };
}

export async function sendTransactionalEmail(args: {
  recipientEmail: string;
  templateName: string;
  templateData?: Record<string, unknown>;
  subject?: string;
  html?: string;
  text?: string;
  messageId?: string;
  idempotencyKey?: string;
  sendDirectly?: boolean;
  /** Dealer branding — if omitted, auto-resolved from templateData.location_id or templateData._dealerId */
  branding?: { dealerName?: string; dealerLogoUrl?: string; primaryColor?: string };
}): Promise<{ queued?: boolean; sent?: boolean; messageId: string }> {
  const { renderEmailTemplate } = await import('../templates/emailTemplates.js');

  let subject = args.subject || '';
  let html = args.html || '';
  let text = args.text;

  if (args.templateName && !html) {
    try {
      // Resolve dealer branding to inject into templates
      let brandingFields: Record<string, unknown> = {};
      const srcBranding = args.branding;
      if (srcBranding?.dealerName || srcBranding?.dealerLogoUrl) {
        brandingFields = {
          _dealerName: srcBranding.dealerName,
          _dealerLogoUrl: srcBranding.dealerLogoUrl,
          _primaryColor: srcBranding.primaryColor,
        };
      } else {
        // Auto-resolve branding from location_id or dealer_id in templateData
        try {
          const { Location } = await import('../models/Location.js');
          const { Dealer } = await import('../models/Dealer.js');
          const locationId = (args.templateData?.location_id || args.templateData?.locationId) as string | undefined;
          const dealerId = args.templateData?._dealerId as string | undefined;
          let dealerDoc: any = null;
          if (locationId) {
            const loc = await Location.findOne({ id: locationId }, { dealer_id: 1 }).lean();
            if ((loc as any)?.dealer_id) {
              dealerDoc = await Dealer.findOne({ id: (loc as any).dealer_id }, { name: 1, logo_url: 1 }).lean();
            }
          } else if (dealerId) {
            dealerDoc = await Dealer.findOne({ id: dealerId }, { name: 1, logo_url: 1 }).lean();
          }
          if (dealerDoc) {
            brandingFields = {
              _dealerName: (dealerDoc as any).name || undefined,
              _dealerLogoUrl: (dealerDoc as any).logo_url || undefined,
            };
          }
        } catch { /* branding resolution is best-effort */ }
      }

      const rendered = renderEmailTemplate(args.templateName, { ...(args.templateData || {}), ...brandingFields });
      subject = subject || rendered.subject;
      html = rendered.html;
      text = text || rendered.text;

      // Apply dealer-specific template customizations (subject/body overrides)
      try {
        const resolvedDealerId = brandingFields._dealerId as string | undefined
          || (brandingFields._dealerName ? undefined : undefined); // dealerId resolved separately below
        const { Location } = await import('../models/Location.js');
        const { Dealer } = await import('../models/Dealer.js');
        const { EmailTemplateCustomization } = await import('../models/EmailTemplateCustomization.js');
        const locationId = (args.templateData?.location_id || args.templateData?.locationId) as string | undefined;
        let dealerIdForCustom: string | null = null;
        if (locationId) {
          const loc = await Location.findOne({ id: locationId }, { dealer_id: 1 }).lean();
          dealerIdForCustom = (loc as any)?.dealer_id || null;
        }
        if (dealerIdForCustom) {
          const custom = await EmailTemplateCustomization.findOne(
            { dealer_id: dealerIdForCustom, template_key: args.templateName },
            { subject_override: 1, body_override: 1 },
          ).lean();
          if (custom) {
            if ((custom as any).subject_override) subject = (custom as any).subject_override;
            if ((custom as any).body_override) html = (custom as any).body_override;
          }
        }
      } catch { /* customization lookup is best-effort */ }
    } catch {
      if (!html) throw new Error(`Template '${args.templateName}' not found and no html provided`);
    }
  }

  if (!subject || !html) {
    throw new Error('subject and html are required (or provide a valid templateName)');
  }

  const messageId = args.messageId || randomUUID();

  if (args.sendDirectly) {
    await sendMail({ to: args.recipientEmail, subject, html, text });
    return { sent: true, messageId };
  }

  await enqueueEmail('transactional_emails', {
    to: args.recipientEmail,
    subject,
    html,
    text,
    label: args.templateName || 'transactional',
    message_id: messageId,
  });

  return { queued: true, messageId };
}
