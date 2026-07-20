import { randomUUID } from 'node:crypto';
import { BusinessUnit } from '../models/BusinessUnit.js';
import { SalesOffice } from '../models/SalesOffice.js';
import { Plant } from '../models/Plant.js';

function toPlain(doc: any) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj._id;
  return obj;
}

// ── Business Units ────────────────────────────────────────────────────────────

export async function listBusinessUnits(filters: Record<string, unknown> = {}) {
  const query: Record<string, unknown> = {};
  if (filters.orgId) query.orgId = filters.orgId;
  if (typeof filters.isActive === 'boolean') query.isActive = filters.isActive;
  const docs = await BusinessUnit.find(query).sort({ name: 1 }).lean();
  return docs.map((d) => { const o = { ...d } as any; delete o._id; return o; });
}

export async function getBusinessUnitById(id: string) {
  const doc = await BusinessUnit.findOne({ id }).lean();
  if (!doc) return null;
  const o = { ...doc } as any; delete o._id; return o;
}

export async function createBusinessUnit(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const doc = new BusinessUnit({
    ...data,
    id: typeof data.id === 'string' && data.id ? data.id : randomUUID(),
    created_at: now,
    updated_at: now,
  });
  await doc.save();
  return toPlain(doc);
}

export async function updateBusinessUnit(id: string, data: Record<string, unknown>) {
  const doc = await BusinessUnit.findOneAndUpdate(
    { id },
    { $set: { ...data, updated_at: new Date().toISOString() } },
    { new: true },
  );
  if (!doc) return null;
  return toPlain(doc);
}

export async function deleteBusinessUnit(id: string) {
  await BusinessUnit.deleteOne({ id });
}

// ── Sales Offices ─────────────────────────────────────────────────────────────

export async function listSalesOffices(filters: Record<string, unknown> = {}) {
  const query: Record<string, unknown> = {};
  if (filters.orgId) query.orgId = filters.orgId;
  if (filters.businessUnitId) query.businessUnitId = filters.businessUnitId;
  if (typeof filters.isActive === 'boolean') query.isActive = filters.isActive;
  const docs = await SalesOffice.find(query).sort({ name: 1 }).lean();
  return docs.map((d) => { const o = { ...d } as any; delete o._id; return o; });
}

export async function getSalesOfficeById(id: string) {
  const doc = await SalesOffice.findOne({ id }).lean();
  if (!doc) return null;
  const o = { ...doc } as any; delete o._id; return o;
}

export async function createSalesOffice(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const doc = new SalesOffice({
    ...data,
    id: typeof data.id === 'string' && data.id ? data.id : randomUUID(),
    created_at: now,
    updated_at: now,
  });
  await doc.save();
  return toPlain(doc);
}

export async function updateSalesOffice(id: string, data: Record<string, unknown>) {
  const doc = await SalesOffice.findOneAndUpdate(
    { id },
    { $set: { ...data, updated_at: new Date().toISOString() } },
    { new: true },
  );
  if (!doc) return null;
  return toPlain(doc);
}

export async function deleteSalesOffice(id: string) {
  await SalesOffice.deleteOne({ id });
}

// ── Plants ────────────────────────────────────────────────────────────────────

export async function listPlants(filters: Record<string, unknown> = {}) {
  const query: Record<string, unknown> = {};
  if (filters.orgId) query.orgId = filters.orgId;
  if (filters.businessUnitId) query.businessUnitId = filters.businessUnitId;
  if (filters.salesOfficeId) query.salesOfficeId = filters.salesOfficeId;
  if (typeof filters.isActive === 'boolean') query.isActive = filters.isActive;
  const docs = await Plant.find(query).sort({ name: 1 }).lean();
  return docs.map((d) => { const o = { ...d } as any; delete o._id; return o; });
}

export async function getPlantById(id: string) {
  const doc = await Plant.findOne({ id }).lean();
  if (!doc) return null;
  const o = { ...doc } as any; delete o._id; return o;
}

export async function createPlant(data: Record<string, unknown>) {
  const now = new Date().toISOString();
  const doc = new Plant({
    ...data,
    id: typeof data.id === 'string' && data.id ? data.id : randomUUID(),
    created_at: now,
    updated_at: now,
  });
  await doc.save();
  return toPlain(doc);
}

export async function updatePlant(id: string, data: Record<string, unknown>) {
  const doc = await Plant.findOneAndUpdate(
    { id },
    { $set: { ...data, updated_at: new Date().toISOString() } },
    { new: true },
  );
  if (!doc) return null;
  return toPlain(doc);
}

export async function deletePlant(id: string) {
  await Plant.deleteOne({ id });
}
