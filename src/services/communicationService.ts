import { randomUUID } from 'node:crypto';
import { Communication } from '../models/Communication.js';

function lean(doc: any) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o._id;
  return o;
}

export async function listCommunications(filters: Record<string, unknown> = {}, limit = 200) {
  const q: Record<string, unknown> = {};
  if (filters.customer_id) q.customer_id = filters.customer_id;
  if (filters.customer_ids) {
    const ids = String(filters.customer_ids).split(',').map((x) => x.trim()).filter(Boolean);
    if (ids.length > 0) q.customer_id = { $in: ids };
  }
  if (filters.test_drive_id) q.test_drive_id = filters.test_drive_id;
  if (filters.status) q.status = filters.status;
  if (filters.type) q.type = filters.type;
  if (filters.purpose) {
    const purposes = String(filters.purpose).split(',').map((x) => x.trim()).filter(Boolean);
    q.purpose = purposes.length === 1 ? purposes[0] : { $in: purposes };
  }
  const sortDir = filters.order === 'asc' ? 1 : -1;
  const docs = await Communication.find(q).sort({ created_at: sortDir }).limit(limit).lean();
  return docs.map((d) => { const o = { ...d } as any; delete o._id; return o; });
}

export async function createCommunication(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const doc = new Communication({ ...data, id: String(data.id || randomUUID()), created_at: now });
  await doc.save();
  return lean(doc);
}

export async function updateCommunicationStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
  const doc = await Communication.findOneAndUpdate(
    { id },
    { $set: { status, ...extra } },
    { new: true },
  );
  return doc ? lean(doc) : null;
}

export async function updateCommunication(id: string, payload: Record<string, unknown>) {
  const doc = await Communication.findOneAndUpdate(
    { id },
    { $set: payload },
    { new: true },
  );
  return doc ? lean(doc) : null;
}
