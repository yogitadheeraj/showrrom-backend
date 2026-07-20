import { randomUUID } from 'node:crypto';
import { Notification } from '../models/Notification.js';

function lean(doc: any) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o._id;
  return o;
}

export async function createNotification(data: Record<string, unknown>) {
  const doc = new Notification({
    ...data,
    id: String(data.id || randomUUID()),
    is_read: false,
    created_at: new Date().toISOString(),
  });
  await doc.save();
  return lean(doc);
}

export async function listNotifications(userId: string, unreadOnly = false) {
  const q: Record<string, unknown> = { user_id: userId };
  if (unreadOnly) q.is_read = false;
  const docs = await Notification.find(q).sort({ created_at: -1 }).limit(100).lean();
  return docs.map((d) => { const o = { ...d } as any; delete o._id; return o; });
}

export async function markAsRead(id: string, userId: string) {
  await Notification.updateOne(
    { id, user_id: userId },
    { $set: { is_read: true, read_at: new Date().toISOString() } },
  );
}

export async function markAllAsRead(userId: string) {
  await Notification.updateMany(
    { user_id: userId, is_read: false },
    { $set: { is_read: true, read_at: new Date().toISOString() } },
  );
}

export async function countUnread(userId: string) {
  return Notification.countDocuments({ user_id: userId, is_read: false });
}
