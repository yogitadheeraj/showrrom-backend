import { Request, Response } from 'express';
import {
  bulkUpsertLocationOperatingHours,
  createLocationOperatingHour,
  deleteLocationOperatingHour,
  getLocationOperatingHourById,
  listLocationOperatingHours,
  updateLocationOperatingHour,
} from '../services/locationOperatingHourService.js';

function toNumber(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function listLocationOperatingHoursController(req: Request, res: Response) {
  try {
    const locationIds = typeof req.query.location_ids === 'string'
      ? req.query.location_ids.split(',').map((x) => x.trim()).filter(Boolean)
      : undefined;

    const data = await listLocationOperatingHours({
      location_id: typeof req.query.location_id === 'string' ? req.query.location_id : undefined,
      location_ids: locationIds,
      day_of_week: toNumber(req.query.day_of_week),
    });

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function getLocationOperatingHourController(req: Request, res: Response) {
  try {
    const data = await getLocationOperatingHourById(req.params.id);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Operating hour not found' } });
      return;
    }

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function createLocationOperatingHourController(req: Request, res: Response) {
  try {
    if (!req.authUser?.uid) {
      res.status(401).json({ data: null, error: { message: 'Unauthorized' } });
      return;
    }

    const data = await createLocationOperatingHour(req.authUser.uid, req.body || {});
    res.status(201).json({ data, error: null });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.startsWith('Forbidden') ? 403 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}

export async function updateLocationOperatingHourController(req: Request, res: Response) {
  try {
    if (!req.authUser?.uid) {
      res.status(401).json({ data: null, error: { message: 'Unauthorized' } });
      return;
    }

    const data = await updateLocationOperatingHour(req.authUser.uid, req.params.id, req.body || {});
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Operating hour not found' } });
      return;
    }

    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.startsWith('Forbidden') ? 403 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}

export async function deleteLocationOperatingHourController(req: Request, res: Response) {
  try {
    if (!req.authUser?.uid) {
      res.status(401).json({ data: null, error: { message: 'Unauthorized' } });
      return;
    }

    const data = await deleteLocationOperatingHour(req.authUser.uid, req.params.id);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Operating hour not found' } });
      return;
    }

    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.startsWith('Forbidden') ? 403 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}

export async function bulkUpsertLocationOperatingHoursController(req: Request, res: Response) {
  try {
    if (!req.authUser?.uid) {
      res.status(401).json({ data: null, error: { message: 'Unauthorized' } });
      return;
    }

    const locationId = String(req.body?.location_id || '');
    const rows = Array.isArray(req.body?.hours) ? req.body.hours : [];

    const data = await bulkUpsertLocationOperatingHours(req.authUser.uid, locationId, rows as any[]);
    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.startsWith('Forbidden') ? 403 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}
