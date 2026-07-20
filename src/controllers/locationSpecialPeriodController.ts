import { Request, Response } from 'express';
import {
  createLocationSpecialPeriod,
  deleteLocationSpecialPeriod,
  getLocationSpecialPeriodById,
  listLocationSpecialPeriods,
  updateLocationSpecialPeriod,
} from '../services/locationSpecialPeriodService.js';

function parseBoolean(value: unknown) {
  if (typeof value !== 'string') return false;
  return value === 'true' || value === '1';
}

export async function listLocationSpecialPeriodsController(req: Request, res: Response) {
  try {
    const data = await listLocationSpecialPeriods({
      location_id: typeof req.query.location_id === 'string' ? req.query.location_id : undefined,
      start_date: typeof req.query.start_date === 'string' ? req.query.start_date : undefined,
      end_date: typeof req.query.end_date === 'string' ? req.query.end_date : undefined,
      include_deleted: parseBoolean(req.query.include_deleted),
    });

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function getLocationSpecialPeriodController(req: Request, res: Response) {
  try {
    const includeDeleted = parseBoolean(req.query.include_deleted);
    const data = await getLocationSpecialPeriodById(req.params.id, includeDeleted);

    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Special period not found' } });
      return;
    }

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function createLocationSpecialPeriodController(req: Request, res: Response) {
  try {
    if (!req.authUser?.uid) {
      res.status(401).json({ data: null, error: { message: 'Unauthorized' } });
      return;
    }

    const data = await createLocationSpecialPeriod(req.authUser.uid, req.body || {});
    res.status(201).json({ data, error: null });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.startsWith('Forbidden') ? 403 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}

export async function updateLocationSpecialPeriodController(req: Request, res: Response) {
  try {
    if (!req.authUser?.uid) {
      res.status(401).json({ data: null, error: { message: 'Unauthorized' } });
      return;
    }

    const data = await updateLocationSpecialPeriod(req.authUser.uid, req.params.id, req.body || {});

    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Special period not found' } });
      return;
    }

    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.startsWith('Forbidden') ? 403 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}

export async function deleteLocationSpecialPeriodController(req: Request, res: Response) {
  try {
    if (!req.authUser?.uid) {
      res.status(401).json({ data: null, error: { message: 'Unauthorized' } });
      return;
    }

    const data = await deleteLocationSpecialPeriod(req.authUser.uid, req.params.id);

    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Special period not found' } });
      return;
    }

    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.startsWith('Forbidden') ? 403 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}
