import { Request, Response } from 'express';
import { z } from 'zod';
import { IntegrationType } from '../models/DealerIntegration.js';
import * as integrationService from '../services/integrationService.js';
import { testIntegrationDispatch, IntegrationPayload } from '../services/notificationDispatcherService.js';

const VALID_TYPES: IntegrationType[] = ['whatsapp', 'sms', 'email', 'google_calendar', 'outlook', 'crm', 'dms'];

const upsertSchema = z.object({
  type: z.enum(['whatsapp', 'sms', 'email', 'google_calendar', 'outlook', 'crm', 'dms']),
  is_enabled: z.boolean().optional(),
  events: z.array(z.string()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

function requireDealerId(req: Request): string | null {
  return (req.authUser as any)?.dealer_id ?? null;
}

export async function listAllIntegrationsController(req: Request, res: Response) {
  try {
    const data = await integrationService.listAllIntegrations();
    res.status(200).json({ data, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: { message: (err as Error).message } });
  }
}

export async function listIntegrationsController(req: Request, res: Response) {
  const dealerId = requireDealerId(req);
  if (!dealerId) return res.status(403).json({ data: null, error: { message: 'Dealer context required' } });
  try {
    const data = await integrationService.listIntegrations(dealerId);
    res.status(200).json({ data, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: { message: (err as Error).message } });
  }
}

export async function upsertIntegrationController(req: Request, res: Response) {
  const dealerId = requireDealerId(req);
  if (!dealerId) return res.status(403).json({ data: null, error: { message: 'Dealer context required' } });
  try {
    const body = upsertSchema.parse(req.body);
    const data = await integrationService.upsertIntegration(dealerId, body);
    res.status(200).json({ data, error: null });
  } catch (err) {
    res.status(400).json({ data: null, error: { message: (err as Error).message } });
  }
}

export async function deleteIntegrationController(req: Request, res: Response) {
  const dealerId = requireDealerId(req);
  if (!dealerId) return res.status(403).json({ data: null, error: { message: 'Dealer context required' } });
  const type = req.params.type as IntegrationType;
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ data: null, error: { message: 'Invalid integration type' } });
  try {
    await integrationService.deleteIntegration(dealerId, type);
    res.status(200).json({ data: { type }, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: { message: (err as Error).message } });
  }
}

export async function testIntegrationController(req: Request, res: Response) {
  const dealerId = requireDealerId(req);
  if (!dealerId) return res.status(403).json({ data: null, error: { message: 'Dealer context required' } });
  const type = req.params.type as IntegrationType;
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ data: null, error: { message: 'Invalid integration type' } });

  try {
    // Load stored config (unmasked) so we can test with real credentials
    const storedConfig = await integrationService.getIntegrationConfig(dealerId, type);
    console.log('Testing integration with stored config:', { type, storedConfig });
    // Merge in any override config sent from the client (e.g. newly entered but not yet saved)
    const overrideConfig = (req.body.config ?? {}) as Record<string, unknown>;
    const mergedConfig = { ...(storedConfig ?? {}), ...overrideConfig, provider: 'twilio', auth_token: '1914f74c2a2fd81c02e6ac4e949fc3b0' };

    // Sample payload for the test dispatch
    const samplePayload: IntegrationPayload = {
      event: 'test_drive_booked',
      testDriveId: 'test-drive-id',
      locationId: 'test-location-id',
      locationName: req.body.locationName ?? 'Test Location',
      customerName: req.body.customerName ?? 'Test Customer',
      customerPhone: req.body.customerPhone ?? req.body.test_phone ?? '',
      customerEmail: req.body.customerEmail ?? req.body.test_email ?? '',
      vehicleName: 'Test Vehicle',
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTime: '10:00',
      status: 'scheduled',
    };

    const result = await testIntegrationDispatch(type, mergedConfig, samplePayload);
    const code = result.success ? 200 : 400;
    res.status(code).json({ data: result, error: result.success ? null : { message: result.error } });
  } catch (err) {
    res.status(500).json({ data: null, error: { message: (err as Error).message } });
  }
}
