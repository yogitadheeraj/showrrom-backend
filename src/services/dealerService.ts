import { randomUUID } from 'node:crypto';
import { Dealer } from '../models/Dealer.js';

function lean(doc: any) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o._id;
  return o;
}

export async function listDealers(filters: Record<string, unknown> = {}) {
  const q: Record<string, unknown> = {};
  if (typeof filters.is_active === 'boolean') q.is_active = filters.is_active;
  else if (filters.is_active === 'true') q.is_active = true;
  else if (filters.is_active === 'false') q.is_active = false;
  if (filters.slug) q.slug = filters.slug;
  const docs = await Dealer.find(q).sort({ name: 1 }).lean();
  return docs.map((d) => { const o = { ...d } as any; delete o._id; return o; });
}

export async function getDealerById(id: string) {
  const doc = await Dealer.findOne({ id }).lean();
  if (!doc) return null;
  const o = { ...doc } as any; delete o._id; return o;
}

export async function getDealerBySlug(slug: string) {
  const doc = await Dealer.findOne({ slug, is_active: true }).lean();
  if (!doc) return null;
  const o = { ...doc } as any; delete o._id; return o;
}

export async function createDealer(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const doc = new Dealer({ ...data, id: String(data.id || randomUUID()), created_at: now, updated_at: now });
  await doc.save();
  return lean(doc);
}

export async function updateDealer(id: string, data: Record<string, unknown>) {
  const doc = await Dealer.findOneAndUpdate({ id }, { $set: { ...data, updated_at: new Date().toISOString() } }, { new: true });
  return doc ? lean(doc) : null;
}

export async function deleteDealer(id: string) {
  await Dealer.deleteOne({ id });
}
