import { randomUUID } from 'node:crypto';
import { getCollectionModel } from '../models/collectionModel.js';
import { Dealer } from '../models/Dealer.js';
import { Location } from '../models/Location.js';
import { Profile } from '../models/Profile.js';
import {
  createFirebaseUser,
  deleteFirebaseUser,
  generateVerificationLink,
  getFirebaseUser,
  getFirebaseUserByEmail,
  setCustomClaims,
} from './firebaseService.js';
import { deleteProfileByUserId, upsertProfile } from './profileService.js';
import { deleteUserRole, getRoleByUserId, upsertUserRole } from './userRoleService.js';
import { env } from '../config/env.js';
import { sendMail, staffVerificationTemplate } from './mailService.js';
import { processEmailQueues } from './emailProcessorService.js';
import {
  sendDailyTestDriveReports,
  sendDailyActivityReports,
  sendTransactionalEmail,
  logReportSendAttempt,
  retryFailedReports,
} from './reportEmailService.js';
import { EmailUnsubscribeToken } from '../models/EmailUnsubscribeToken.js';

const CREATEABLE_ROLES = ['dealer_admin', 'brand_admin', 'sales_admin', 'branch_admin', 'gro', 'sales', 'security'] as const;
const DEALER_ADMIN_CREATEABLE_ROLES = ['brand_admin', 'sales_admin', 'branch_admin', 'gro', 'sales', 'security'] as const;
const SALES_ADMIN_CREATEABLE_ROLES = ['sales'] as const;

type CreateableRole = (typeof CREATEABLE_ROLES)[number];

function normalizeRole(input: unknown): CreateableRole | null {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return null;

  const normalized = raw.replace(/[-\s]+/g, '_');
  if (normalized === 'salesadmin') return 'sales_admin';
  if (normalized === 'branchadmin') return 'branch_admin';

  if ((CREATEABLE_ROLES as readonly string[]).includes(normalized)) {
    return normalized as CreateableRole;
  }

  return null;
}

async function getCallerRole(userId: string): Promise<string | null> {
  const userRoles = getCollectionModel('user_roles');
  const roleRow = await userRoles.findOne({ user_id: userId });
  return roleRow?.role ? String(roleRow.role) : null;
}

async function resolveDealerIdForUser(userId: string): Promise<string | null> {
  const dealerByAdmin = await Dealer.findOne({ admin_user_id: userId }).lean();
  if (dealerByAdmin?.id) return String(dealerByAdmin.id);

  const profile = await Profile.findOne({ user_id: userId }).lean();
  if (!profile?.location_id) return null;

  const location = await Location.findOne({ id: profile.location_id }).lean();
  return location?.dealer_id ? String(location.dealer_id) : null;
}

async function createStaffUser(payload: Record<string, unknown>, callerUserId?: string) {
  if (!callerUserId) {
    throw new Error('Unauthorized');
  }

  const callerRole = await getCallerRole(callerUserId);
  const isSuperAdmin = callerRole === 'superadmin' || callerRole === 'super_admin';
  const isDealerAdmin = callerRole === 'dealer_admin';
  const isSalesAdmin = callerRole === 'sales_admin' || callerRole === 'branch_admin';

  if (!isSuperAdmin && !isDealerAdmin && !isSalesAdmin) {
    throw new Error('Forbidden');
  }

  const email = String(payload.email ?? '').trim().toLowerCase();
  const password = String(payload.password ?? '');
  const fullName = String(payload.fullName ?? '').trim();
  const role = normalizeRole(payload.role);
  const locationId = payload.locationId ? String(payload.locationId) : null;
  const brandIds = Array.isArray(payload.brandIds)
    ? payload.brandIds.map((brandId) => String(brandId || '').trim()).filter(Boolean)
    : payload.brandId
      ? [String(payload.brandId).trim()].filter(Boolean)
      : [];

  if (!email || !password || !fullName || !role) {
    throw new Error('Missing required fields');
  }

  if (isDealerAdmin && !(DEALER_ADMIN_CREATEABLE_ROLES as readonly string[]).includes(role)) {
    throw new Error('Organization Admin cannot create users with this role');
  }

  if (isSalesAdmin && !(SALES_ADMIN_CREATEABLE_ROLES as readonly string[]).includes(role)) {
    throw new Error('Sales admin can create only sales users');
  }

  let dealerId: string | null = null;
  // brand_admin doesn't require a specific location
  if (isDealerAdmin || isSalesAdmin) {
    if (!locationId && role !== 'brand_admin') {
      throw new Error('Location is required');
    }

    const location = await Location.findOne({ id: locationId }).lean();
    if (!location) {
      throw new Error('Invalid location');
    }

    if (isDealerAdmin) {
      dealerId = await resolveDealerIdForUser(callerUserId);
      if (!dealerId || String(location.dealer_id || '') !== dealerId) {
        throw new Error('Invalid location for your dealership');
      }
    }

    if (isSalesAdmin) {
      const callerProfile = await Profile.findOne({ user_id: callerUserId }).lean();
      if (!callerProfile?.location_id || String(callerProfile.location_id) !== locationId) {
        throw new Error('Sales admin can create staff only for own location');
      }
      dealerId = location.dealer_id ? String(location.dealer_id) : null;
    }
  }

  const existingProfile = await Profile.findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
  if (existingProfile) {
    throw new Error('A staff profile with this email already exists.');
  }

  const existing = await getFirebaseUserByEmail(email);
  if (existing) {
    throw new Error('This email is already registered.');
  }

  const created = await createFirebaseUser({
    email,
    password,
    displayName: fullName,
  });

  try {
    await upsertUserRole(created.uid, role as any);
    await upsertProfile({
      user_id: created.uid,
      full_name: fullName,
      email,
      location_id: locationId,
      brand_ids: brandIds,
      is_active: true,
    });

    await setCustomClaims(created.uid, {
      role,
      location_id: locationId || undefined,
      dealer_id: dealerId || undefined,
    });

    const verificationLink = await generateVerificationLink(email);
    const loginUrl = `${env.corsOrigin}/auth`;
    const roleLabel = role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const template = staffVerificationTemplate({
      fullName,
      roleLabel,
      verificationLink,
      loginUrl,
    });

    const mailStatus = await sendMail({
      to: email,
      subject: 'Verify your account to sign in',
      html: template.html,
      text: template.text,
    });

    return {
      success: true,
      userId: created.uid,
      email,
      role,
      locationId,
      brandIds,
      verificationEmailSent: mailStatus.sent,
      verificationEmailSkipped: mailStatus.skipped,
      verificationLink: mailStatus.sent ? null : verificationLink,
    };
  } catch (error) {
    await deleteFirebaseUser(created.uid);
    throw error;
  }
}

async function resolveDealerIdForTargetUser(targetUserId: string): Promise<string | null> {
  const directDealer = await Dealer.findOne({ admin_user_id: targetUserId }).lean();
  if (directDealer?.id) return String(directDealer.id);

  const profile = await Profile.findOne({ user_id: targetUserId }).lean();
  if (!profile?.location_id) return null;

  const location = await Location.findOne({ id: profile.location_id }).lean();
  return location?.dealer_id ? String(location.dealer_id) : null;
}

async function canAccessTargetUser(callerUserId: string, targetUserId: string) {
  const callerRole = await getCallerRole(callerUserId);
  const isSuperAdmin = callerRole === 'superadmin' || callerRole === 'super_admin';
  const isDealerAdmin = callerRole === 'dealer_admin';
  const isSalesAdmin = callerRole === 'sales_admin' || callerRole === 'branch_admin';

  if (!isSuperAdmin && !isDealerAdmin && !isSalesAdmin) {
    return { allowed: false, reason: 'Forbidden', callerRole, isSuperAdmin, isDealerAdmin, isSalesAdmin };
  }

  if (isDealerAdmin || isSalesAdmin) {
    const callerDealerId = await resolveDealerIdForUser(callerUserId);
    const targetDealerId = await resolveDealerIdForTargetUser(targetUserId);
    if (!callerDealerId || !targetDealerId || callerDealerId !== targetDealerId) {
      return { allowed: false, reason: 'Target user is not in your dealership scope', callerRole, isSuperAdmin, isDealerAdmin, isSalesAdmin };
    }
  }

  const targetRoleRow = await getRoleByUserId(targetUserId);
  const targetRole = String(targetRoleRow?.role || '');

  if (!isSuperAdmin && targetRole === 'dealer_admin') {
    return { allowed: false, reason: 'Only superadmin can manage Organization Admin users', callerRole, isSuperAdmin, isDealerAdmin, isSalesAdmin };
  }

  if (isSalesAdmin && targetRole !== 'sales') {
    return { allowed: false, reason: 'Sales admin can manage only sales users', callerRole, isSuperAdmin, isDealerAdmin, isSalesAdmin };
  }

  return { allowed: true, reason: null, callerRole, isSuperAdmin, isDealerAdmin, isSalesAdmin, targetRole };
}

async function getStaffVerificationStatus(payload: Record<string, unknown>, callerUserId?: string) {
  if (!callerUserId) throw new Error('Unauthorized');

  const userIds = Array.isArray(payload.userIds)
    ? payload.userIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];

  const statusByUserId: Record<string, boolean> = {};
  for (const targetUserId of userIds) {
    const access = await canAccessTargetUser(callerUserId, targetUserId);
    if (!access.allowed) continue;

    try {
      const authUser = await getFirebaseUser(targetUserId);
      statusByUserId[targetUserId] = Boolean(authUser.emailVerified);
    } catch {
      statusByUserId[targetUserId] = false;
    }
  }

  return { success: true, statusByUserId };
}

async function resendStaffVerification(payload: Record<string, unknown>, callerUserId?: string) {
  if (!callerUserId) throw new Error('Unauthorized');

  const targetUserId = String(payload.userId ?? '').trim();
  if (!targetUserId) throw new Error('userId is required');

  const access = await canAccessTargetUser(callerUserId, targetUserId);
  if (!access.allowed) throw new Error(access.reason || 'Forbidden');

  const authUser = await getFirebaseUser(targetUserId);
  if (!authUser.email) throw new Error('Target user email not found');

  if (authUser.emailVerified) {
    return { success: true, alreadyVerified: true, sent: false };
  }

  const profile = await Profile.findOne({ user_id: targetUserId }).lean();
  const fullName = String(profile?.full_name || authUser.displayName || 'Team Member');
  const roleRow = await getRoleByUserId(targetUserId);
  const roleRaw = String(roleRow?.role || 'staff');
  const roleLabel = roleRaw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const verificationLink = await generateVerificationLink(authUser.email);
  const loginUrl = `${env.corsOrigin}/auth`;
  const template = staffVerificationTemplate({
    fullName,
    roleLabel,
    verificationLink,
    loginUrl,
  });

  const mailStatus = await sendMail({
    to: authUser.email,
    subject: 'Verify your account to sign in',
    html: template.html,
    text: template.text,
  });

  return {
    success: true,
    alreadyVerified: false,
    sent: mailStatus.sent,
    skipped: mailStatus.skipped,
    verificationLink: mailStatus.sent ? null : verificationLink,
  };
}

async function deleteStaffUser(payload: Record<string, unknown>, callerUserId?: string) {
  if (!callerUserId) throw new Error('Unauthorized');

  const targetUserId = String(payload.userId ?? '').trim();
  if (!targetUserId) throw new Error('userId is required');
  if (targetUserId === callerUserId) throw new Error('You cannot delete your own account');

  const access = await canAccessTargetUser(callerUserId, targetUserId);
  if (!access.allowed) throw new Error(access.reason || 'Forbidden');

  await deleteUserRole(targetUserId);
  await deleteProfileByUserId(targetUserId);
  await deleteFirebaseUser(targetUserId);

  return { success: true, userId: targetUserId };
}

export async function invokeFunction(name: string, payload: unknown, userId?: string) {
  const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;

  if (name === 'create-staff-user') return createStaffUser(body, userId);
  if (name === 'delete-staff-user') return deleteStaffUser(body, userId);
  if (name === 'staff-verification-status') return getStaffVerificationStatus(body, userId);
  if (name === 'resend-staff-verification') return resendStaffVerification(body, userId);

  // ── Email ──────────────────────────────────────────────────────────────────

  if (name === 'send-transactional-email') {
    const recipientEmail = String(body.recipientEmail || body.recipient_email || '');
    const templateName = String(body.templateName || body.template_name || '');
    if (!recipientEmail) throw new Error('recipientEmail is required');
    return sendTransactionalEmail({
      recipientEmail,
      templateName,
      templateData: (body.templateData || body.template_data || {}) as Record<string, unknown>,
      subject: body.subject as string | undefined,
      html: body.html as string | undefined,
      text: body.text as string | undefined,
      messageId: body.messageId as string | undefined,
    });
  }

  if (name === 'process-email-queue') {
    return processEmailQueues();
  }

  if (name === 'handle-email-unsubscribe') {
    const token = String(body.token || '');
    const email = String(body.email || '');
    if (token) {
      await EmailUnsubscribeToken.findOneAndUpdate(
        { token },
        { $set: { unsubscribed_at: new Date() } },
      );
      return { success: true, method: 'token' };
    } else if (email) {
      await EmailUnsubscribeToken.updateMany(
        { email },
        { $set: { unsubscribed_at: new Date() } },
      );
      return { success: true, method: 'email' };
    }
    throw new Error('token or email is required');
  }

  // ── Reports ────────────────────────────────────────────────────────────────

  if (name === 'send-daily-test-drive-reports') {
    return sendDailyTestDriveReports({
      reportDate: body.reportDate as string | undefined,
      locationIds: Array.isArray(body.locationIds) ? (body.locationIds as string[]) : undefined,
    });
  }

  if (name === 'send-daily-activity-reports') {
    return sendDailyActivityReports({
      reportDate: body.reportDate as string | undefined,
      locationIds: Array.isArray(body.locationIds) ? (body.locationIds as string[]) : undefined,
    });
  }

  if (name === 'trigger-scheduled-reports') {
    const today = new Date().toISOString().split('T')[0];
    const [testDriveResult, activityResult] = await Promise.all([
      sendDailyTestDriveReports({ reportDate: today }),
      sendDailyActivityReports({ reportDate: today }),
    ]);
    return { testDrive: testDriveResult, activity: activityResult };
  }

  if (name === 'handle-report-retry' || name === 'process-report-retries') {
    return retryFailedReports();
  }

  if (name === 'log-report-send-attempt') {
    await logReportSendAttempt({
      reportId: String(body.reportId || body.report_id || ''),
      status: (body.status as 'sent' | 'failed') || 'failed',
      errorMessage: body.errorMessage as string | undefined,
    });
    return { success: true };
  }

  // ── Fallback: log unknown invocations ──────────────────────────────────────

  const logs = getCollectionModel('function_invocations');
  const invocation = {
    id: randomUUID(),
    function_name: name,
    payload,
    user_id: userId || null,
    status: 'queued',
    created_at: new Date().toISOString(),
  };
  await logs.create(invocation);
  return { queued: true, invocationId: invocation.id, functionName: name };
}
