import { randomUUID } from 'node:crypto';
import { Brand } from '../models/Brand.js';

function toPlain(doc: any) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj._id;
  return obj;
}

export async function listBrands(filters: Record<string, unknown> = {}) {
  const query: Record<string, unknown> = {};
  if (filters.dealer_id) query.dealer_id = filters.dealer_id;
  if (typeof filters.is_active === 'boolean') query.is_active = filters.is_active;
  const docs = await Brand.find(query).sort({ name: 1 }).lean();
  return docs.map((d) => { const o = { ...d } as any; delete o._id; return o; });
}

export async function getBrandById(id: string) {
  const doc = await Brand.findOne({ id }).lean();
  if (!doc) return null;
  const o = { ...doc } as any; delete o._id; return o;
}

export async function createBrand(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const doc = new Brand({
    ...data,
    id: typeof data.id === 'string' && data.id ? data.id : randomUUID(),
    created_at: now,
    updated_at: now,
  });
  await doc.save();
  return toPlain(doc);
}

export async function updateBrand(id: string, data: Record<string, unknown>) {
  const doc = await Brand.findOneAndUpdate(
    { id },
    { $set: { ...data, updated_at: new Date().toISOString() } },
    { new: true },
  );
  if (!doc) return null;
  return toPlain(doc);
}

export async function deleteBrand(id: string) {
  await Brand.deleteOne({ id });
}
