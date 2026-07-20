import { Request, Response } from 'express';
import {
  deleteConfig,
  getConfigByLocationId,
  listConfigs,
  upsertConfig,
} from '../services/followUpReminderConfigService.js';

export async function listFollowUpReminderConfigsController(req: Request, res: Response) {
  try {
    const location_id = typeof req.query.location_id === 'string' ? req.query.location_id : undefined;
    const dealer_id = typeof req.query.dealer_id === 'string' ? req.query.dealer_id : undefined;

    const data = await listConfigs({ location_id, dealer_id });
    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function getFollowUpReminderConfigController(req: Request, res: Response) {
  try {
    const locationId = typeof req.params.locationId === 'string' ? req.params.locationId : '';
    if (!locationId) {
      res.status(400).json({ data: null, error: { message: 'locationId is required' } });
      return;
    }

    const data = await getConfigByLocationId(locationId);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Reminder config not found for this location' } });
      return;
    }

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function upsertFollowUpReminderConfigController(req: Request, res: Response) {
  try {
    if (!req.authUser?.uid) {
      res.status(401).json({ data: null, error: { message: 'Unauthorized' } });
      return;
    }

    const data = await upsertConfig(req.authUser.uid, req.body || {});
    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.startsWith('Forbidden') ? 403 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}

export async function deleteFollowUpReminderConfigController(req: Request, res: Response) {
  try {
    if (!req.authUser?.uid) {
      res.status(401).json({ data: null, error: { message: 'Unauthorized' } });
      return;
    }

    const locationId = typeof req.params.locationId === 'string' ? req.params.locationId : '';
    if (!locationId) {
      res.status(400).json({ data: null, error: { message: 'locationId is required' } });
      return;
    }

    const data = await deleteConfig(req.authUser.uid, locationId);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Reminder config not found for this location' } });
      return;
    }

    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.startsWith('Forbidden') ? 403 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}
