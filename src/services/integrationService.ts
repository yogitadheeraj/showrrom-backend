import { randomUUID } from 'node:crypto';
import { DealerIntegration, maskConfig, SENSITIVE_CONFIG_KEYS, IntegrationType } from '../models/DealerIntegration.js';
import { Dealer } from '../models/Dealer.js';

function lean(doc: any) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  delete o._id;
  return o;
}

function withMaskedConfig(row: any) {
  return { ...row, config: maskConfig(row.type as IntegrationType, row.config ?? {}) };
}

export async function listIntegrations(dealerId: string) {
  const docs = await DealerIntegration.find({ dealer_id: dealerId }).lean() as any[];
  return docs.map(d => { const o = { ...d }; delete o._id; return withMaskedConfig(o); });
}

export async function upsertIntegration(dealerId: string, data: {
  type: IntegrationType;
  is_enabled?: boolean;
  events?: string[];
  config?: Record<string, unknown>;
}) {
  const existing = await DealerIntegration.findOne({ dealer_id: dealerId, type: data.type }).lean() as any;

  // Merge config: keep existing sensitive values if incoming value is '***'
  const existingConfig = (existing?.config ?? {}) as Record<string, unknown>;
  const incomingConfig = (data.config ?? {}) as Record<string, unknown>;
  const sensitive = SENSITIVE_CONFIG_KEYS[data.type] ?? [];
  const mergedConfig: Record<string, unknown> = { ...existingConfig };
  for (const [k, v] of Object.entries(incomingConfig)) {
    if (sensitive.includes(k) && v === '***') continue; // keep existing value
    mergedConfig[k] = v;
  }

  const now = new Date().toISOString();
  if (existing) {
    const doc = await DealerIntegration.findOneAndUpdate(
      { dealer_id: dealerId, type: data.type },
      {
        $set: {
          is_enabled: data.is_enabled ?? existing.is_enabled,
          events: data.events ?? existing.events,
          config: mergedConfig,
          updated_at: now,
        },
      },
      { new: true },
    ).lean() as any;
    if (!doc) return null;
    delete doc._id;
    return withMaskedConfig(doc);
  }

  const doc = new DealerIntegration({
    id: randomUUID(),
    dealer_id: dealerId,
    type: data.type,
    is_enabled: data.is_enabled ?? false,
    events: data.events ?? [],
    config: mergedConfig,
    created_at: now,
    updated_at: now,
  });
  await doc.save();
  return withMaskedConfig(lean(doc));
}

export async function deleteIntegration(dealerId: string, type: IntegrationType) {
  await DealerIntegration.deleteOne({ dealer_id: dealerId, type });
}

/** Load full (unmasked) config for a single integration — used internally by the test dispatcher */
export async function getIntegrationConfig(dealerId: string, type: IntegrationType) {
  const doc = await DealerIntegration.findOne({ dealer_id: dealerId, type }).lean() as any;
  if (!doc) return null;
  return doc.config as Record<string, unknown>;
}

/** Superadmin: list all integrations across all dealers, grouped with dealer info */
export async function listAllIntegrations() {
  const [docs, dealers] = await Promise.all([
    DealerIntegration.find({}).lean() as Promise<any[]>,
    Dealer.find({}, { id: 1, name: 1, contact_email: 1, is_active: 1 }).lean() as Promise<any[]>,
  ]);

  const dealerMap = new Map<string, { id: string; name: string; contact_email: string; is_active: boolean }>();
  for (const d of dealers) {
    dealerMap.set(d.id, { id: d.id, name: d.name, contact_email: d.contact_email, is_active: d.is_active });
  }

  // Group integrations by dealer_id
  const grouped = new Map<string, { dealer: any; integrations: any[] }>();
  for (const doc of docs) {
    const o = { ...doc } as any;
    delete o._id;
    const masked = withMaskedConfig(o);
    if (!grouped.has(doc.dealer_id)) {
      grouped.set(doc.dealer_id, {
        dealer: dealerMap.get(doc.dealer_id) ?? { id: doc.dealer_id, name: 'Unknown Dealer', contact_email: '', is_active: true },
        integrations: [],
      });
    }
    grouped.get(doc.dealer_id)!.integrations.push(masked);
  }

  return Array.from(grouped.values());
}
