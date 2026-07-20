import { Request, Response } from 'express';
import {
  cancelConflictingBookings,
  createBlockedSlot,
  deleteBlockedSlot,
  getBlockedSlotById,
  listBlockedSlots,
} from '../services/locationBlockedSlotService.js';

export async function listBlockedSlotsController(req: Request, res: Response) {
  try {
    const location_id = typeof req.query.location_id === 'string' ? req.query.location_id : undefined;
    const blocked_date = typeof req.query.blocked_date === 'string' ? req.query.blocked_date : undefined;
    const from_date = typeof req.query.from_date === 'string' ? req.query.from_date : undefined;
    const to_date = typeof req.query.to_date === 'string' ? req.query.to_date : undefined;

    const data = await listBlockedSlots({ location_id, blocked_date, from_date, to_date });
    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function getBlockedSlotController(req: Request, res: Response) {
  try {
    const data = await getBlockedSlotById(req.params.id);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Blocked slot not found' } });
      return;
    }
    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function createBlockedSlotController(req: Request, res: Response) {
  try {
    if (!req.authUser?.uid) {
      res.status(401).json({ data: null, error: { message: 'Unauthorized' } });
      return;
    }

    const data = await createBlockedSlot(req.authUser.uid, req.body || {});
    res.status(201).json({ data, error: null });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.startsWith('Forbidden') ? 403 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}

export async function deleteBlockedSlotController(req: Request, res: Response) {
  try {
    if (!req.authUser?.uid) {
      res.status(401).json({ data: null, error: { message: 'Unauthorized' } });
      return;
    }

    const data = await deleteBlockedSlot(req.authUser.uid, req.params.id);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Blocked slot not found' } });
      return;
    }

    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.startsWith('Forbidden') ? 403 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}

export async function cancelConflictingBookingsController(req: Request, res: Response) {
  try {
    if (!req.authUser?.uid) {
      res.status(401).json({ data: null, error: { message: 'Unauthorized' } });
      return;
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const data = await cancelConflictingBookings(req.authUser.uid, req.params.id, reason);
    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.startsWith('Forbidden') ? 403 : message === 'Blocked slot not found' ? 404 : 400;
    res.status(status).json({ data: null, error: { message } });
  }
}
