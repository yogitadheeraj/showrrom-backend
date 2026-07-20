/**
 * Firebase Common Service
 *
 * Centralizes all Firebase Admin operations:
 *  - User lifecycle (create, update, disable, delete, custom claims)
 *  - FCM push notifications per user and per role/location
 *  - Test-drive status change notifications with time-release messages
 */

import { getApps } from 'firebase-admin/app';
import { getAuth, UserRecord } from 'firebase-admin/auth';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { Notification } from '../models/Notification.js';
import { Profile } from '../models/Profile.js';
import { UserRole } from '../models/UserRole.js';

// ─── Guards ──────────────────────────────────────────────────────────────────

function adminReady() {
  return getApps().length > 0;
}

// ─── User Management ─────────────────────────────────────────────────────────

export type CreateUserInput = {
  email: string;
  password: string;
  displayName?: string;
  disabled?: boolean;
};

export async function createFirebaseUser(input: CreateUserInput): Promise<UserRecord> {
  if (!adminReady()) throw new Error('Firebase Admin is not initialized.');
  return getAuth().createUser({
    email: input.email,
    password: input.password,
    displayName: input.displayName,
    disabled: input.disabled ?? false,
    emailVerified: false,
  });
}

export async function updateFirebaseUser(
  uid: string,
  updates: { displayName?: string; email?: string; password?: string; disabled?: boolean; emailVerified?: boolean },
): Promise<UserRecord> {
  if (!adminReady()) throw new Error('Firebase Admin is not initialized.');
  return getAuth().updateUser(uid, updates);
}

export async function disableFirebaseUser(uid: string): Promise<void> {
  if (!adminReady()) throw new Error('Firebase Admin is not initialized.');
  await getAuth().updateUser(uid, { disabled: true });
}

export async function enableFirebaseUser(uid: string): Promise<void> {
  if (!adminReady()) throw new Error('Firebase Admin is not initialized.');
  await getAuth().updateUser(uid, { disabled: false });
}

export async function deleteFirebaseUser(uid: string): Promise<void> {
  if (!adminReady()) throw new Error('Firebase Admin is not initialized.');
  await getAuth().deleteUser(uid);
}

export async function getFirebaseUser(uid: string): Promise<UserRecord> {
  if (!adminReady()) throw new Error('Firebase Admin is not initialized.');
  return getAuth().getUser(uid);
}

export async function getFirebaseUserByEmail(email: string): Promise<UserRecord | null> {
  if (!adminReady()) throw new Error('Firebase Admin is not initialized.');
  try {
    return await getAuth().getUserByEmail(email);
  } catch {
    return null;
  }
}

/** Set custom claims that control role-based access client-side. */
export async function setCustomClaims(
  uid: string,
  claims: { role?: string; location_id?: string; dealer_id?: string },
): Promise<void> {
  if (!adminReady()) throw new Error('Firebase Admin is not initialized.');
  await getAuth().setCustomUserClaims(uid, claims);
}

/** Generate a password-reset link with a redirect back to the app. */
export async function generatePasswordResetLink(email: string): Promise<string> {
  if (!adminReady()) throw new Error('Firebase Admin is not initialized.');
  return getAuth().generatePasswordResetLink(email, { url: `${env.corsOrigin}/auth` });
}

/** Generate an email-verification link with a redirect back to the app. */
export async function generateVerificationLink(email: string): Promise<string> {
  if (!adminReady()) throw new Error('Firebase Admin is not initialized.');
  return getAuth().generateEmailVerificationLink(email, { url: `${env.corsOrigin}/auth?verified=true` });
}

// ─── FCM Token Registry ───────────────────────────────────────────────────────

/**
 * Fetch all FCM registration tokens for a given Firebase UID from the
 * profile document. Profiles may store an array of device tokens under
 * `fcm_tokens`.
 */
async function getTokensForUser(userId: string): Promise<string[]> {
  const profile = await Profile.findOne({ user_id: userId }, { fcm_tokens: 1 }).lean();
  const raw = (profile as any)?.fcm_tokens;
  if (!raw) return [];
  return Array.isArray(raw) ? raw.filter(Boolean) : [String(raw)];
}

/**
 * Get all FCM tokens for all users at a location filtered by an optional role.
 */
async function getTokensForLocation(locationId: string, role?: string): Promise<string[]> {
  let userIds: string[] = [];

  if (role) {
    const roles = await UserRole.find({ role }).lean();
    const allUids = roles.map((r: any) => r.user_id);
    const profiles = await Profile.find({ user_id: { $in: allUids }, location_id: locationId }, { fcm_tokens: 1 }).lean();
    userIds = profiles.map((p: any) => p.user_id);
  } else {
    const profiles = await Profile.find({ location_id: locationId }, { fcm_tokens: 1, user_id: 1 }).lean();
    userIds = profiles.map((p: any) => p.user_id);
  }

  const allTokens: string[] = [];
  for (const uid of userIds) {
    const tokens = await getTokensForUser(uid);
    allTokens.push(...tokens);
  }
  return [...new Set(allTokens)];
}

// ─── Push Notification Helpers ────────────────────────────────────────────────

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
};

/** Send a push notification to a specific user by Firebase UID. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!adminReady()) return;
  const tokens = await getTokensForUser(userId);
  if (!tokens.length) return;
  await sendMulticast(tokens, payload);
}

/** Send a push notification to all staff at a location, optionally filtered by role. */
export async function sendPushToLocation(
  locationId: string,
  payload: PushPayload,
  role?: string,
): Promise<void> {
  if (!adminReady()) return;
  const tokens = await getTokensForLocation(locationId, role);
  if (!tokens.length) return;
  await sendMulticast(tokens, payload);
}

async function sendMulticast(tokens: string[], payload: PushPayload): Promise<void> {
  if (!tokens.length) return;

  const message: MulticastMessage = {
    tokens,
    notification: { title: payload.title, body: payload.body, imageUrl: payload.imageUrl },
    data: payload.data,
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  };

  const result = await getMessaging().sendEachForMulticast(message);
  if (result.failureCount > 0) {
    console.warn(`[FCM] ${result.failureCount} tokens failed out of ${tokens.length}`);
  }
}

// ─── In-App Notification Persist ─────────────────────────────────────────────

export async function persistNotification(data: {
  userId: string;
  profileId?: string;
  locationId?: string;
  title: string;
  body: string;
  type: string;
  referenceId?: string;
  referenceType?: string;
  metadata?: Record<string, unknown>;
}) {
  const doc = new Notification({
    id: randomUUID(),
    user_id: data.userId,
    profile_id: data.profileId || null,
    location_id: data.locationId || null,
    title: data.title,
    body: data.body,
    type: data.type,
    reference_id: data.referenceId || null,
    reference_type: data.referenceType || null,
    is_read: false,
    metadata: data.metadata || null,
    created_at: new Date().toISOString(),
  });
  await doc.save();
  return doc.toObject();
}

// ─── Test Drive Status Notifications ─────────────────────────────────────────

export type TestDriveNotifyContext = {
  testDriveId: string;
  customerId?: string;
  locationId: string;
  customerName: string;
  vehicleName: string;
  assignedSalesUserId?: string;
  assignedGroUserId?: string;
  assignedSecurityUserId?: string;
  scheduledDate?: string;
  scheduledTime?: string;
};

type StatusMessages = {
  customer?: PushPayload;
  sales?: PushPayload;
  gro?: PushPayload;
  security?: PushPayload;
  location?: { payload: PushPayload; role?: string };
};

function buildStatusMessages(
  status: string,
  ctx: TestDriveNotifyContext,
): StatusMessages | null {
  const vehicle = ctx.vehicleName;
  const name = ctx.customerName;
  const time = ctx.scheduledTime ? ` at ${ctx.scheduledTime}` : '';
  const ref = { test_drive_id: ctx.testDriveId, location_id: ctx.locationId };
  const refStr = Object.fromEntries(Object.entries(ref).map(([k, v]) => [k, String(v)]));

  switch (status) {
    case 'scheduled':
    case 'confirmed':
      return {
        customer: { title: 'Test Drive Confirmed', body: `Your ${vehicle} test drive is confirmed${time}.`, data: refStr },
        sales: { title: 'New Test Drive', body: `${name} booked ${vehicle}${time}.`, data: refStr },
        gro: { title: 'New Booking', body: `Test drive for ${vehicle} by ${name}${time}.`, data: refStr },
      };

    case 'show':
      return {
        sales: { title: 'Customer Arrived', body: `${name} has arrived for ${vehicle} test drive.`, data: refStr },
        gro: { title: 'Customer Arrived', body: `${name} has arrived. Please assign keys for ${vehicle}.`, data: refStr },
        security: { title: 'Customer Checked In', body: `${name} arrived for ${vehicle}. Verify license.`, data: refStr },
      };

    case 'in_progress':
      return {
        sales: { title: 'Drive Started', body: `${name} is on the road with ${vehicle}.`, data: refStr },
        gro: { title: 'Drive in Progress', body: `${vehicle} drive started with ${name}.`, data: refStr },
        security: { title: 'Vehicle Released', body: `${vehicle} is out for test drive with ${name}.`, data: refStr },
      };

    case 'completed':
      return {
        customer: { title: 'Test Drive Complete!', body: `Thank you ${name}! How was your ${vehicle} experience?`, data: refStr },
        sales: { title: 'Drive Completed', body: `${name} completed ${vehicle} test drive. Follow up now.`, data: refStr },
        gro: { title: 'Drive Completed', body: `${name} returned. ${vehicle} drive is done.`, data: refStr },
        security: { title: 'Vehicle Returned', body: `${vehicle} returned from test drive with ${name}.`, data: refStr },
      };

    case 'no_show':
      return {
        sales: { title: 'Customer No-Show', body: `${name} did not show up for ${vehicle}${time}.`, data: refStr },
        gro: { title: 'No-Show Recorded', body: `${name} marked as no-show for ${vehicle}.`, data: refStr },
      };

    case 'cancelled':
      return {
        customer: { title: 'Test Drive Cancelled', body: `Your ${vehicle} test drive has been cancelled.`, data: refStr },
        sales: { title: 'Drive Cancelled', body: `${name}'s ${vehicle} test drive was cancelled.`, data: refStr },
        gro: { title: 'Drive Cancelled', body: `${vehicle} booking for ${name} cancelled.`, data: refStr },
      };

    case 'rescheduled':
      return {
        customer: { title: 'Test Drive Rescheduled', body: `Your ${vehicle} test drive has been rescheduled${time}.`, data: refStr },
        sales: { title: 'Drive Rescheduled', body: `${name}'s ${vehicle} drive rescheduled to${time}.`, data: refStr },
      };

    default:
      return null;
  }
}

/**
 * Emit notifications for a test drive status change.
 * - Persists in-app notifications to MongoDB
 * - Sends FCM push to relevant staff/customer tokens
 */
export async function notifyTestDriveStatusChange(
  status: string,
  ctx: TestDriveNotifyContext,
): Promise<void> {
  const messages = buildStatusMessages(status, ctx);
  if (!messages) return;

  const tasks: Promise<unknown>[] = [];
  const ref = { referenceId: ctx.testDriveId, referenceType: 'test_drive' };

  // Helper to fan out both push + persist
  const emit = async (userId: string, payload: PushPayload, profileId?: string) => {
    await Promise.allSettled([
      sendPushToUser(userId, payload),
      persistNotification({ userId, profileId, locationId: ctx.locationId, ...payload, type: `test_drive_${status}`, ...ref }),
    ]);
  };

  if (messages.sales && ctx.assignedSalesUserId) {
    tasks.push(emit(ctx.assignedSalesUserId, messages.sales));
  }

  if (messages.gro && ctx.assignedGroUserId) {
    tasks.push(emit(ctx.assignedGroUserId, messages.gro));
  }

  if (messages.security && ctx.assignedSecurityUserId) {
    tasks.push(emit(ctx.assignedSecurityUserId, messages.security));
  }

  // Broadcast to whole location role if no specific user
  if (messages.location) {
    tasks.push(sendPushToLocation(ctx.locationId, messages.location.payload, messages.location.role));
  }

  await Promise.allSettled(tasks);
}
