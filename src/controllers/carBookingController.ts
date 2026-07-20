import { Request, Response } from 'express';
import {
  listCarBookings,
  getCarBookingById,
  createCarBooking,
  cancelCarBooking,
  refundCarBooking,
  countCarBookings,
} from '../services/carBookingService.js';

export async function listCarBookingsController(req: Request, res: Response) {
  try {
    const filters: Record<string, unknown> = {};

    if (req.query.location_id) filters.location_id = req.query.location_id;
    if (req.query.location_ids) {
      filters.location_ids = String(req.query.location_ids)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }
    if (req.query.customer_id) filters.customer_id = req.query.customer_id;
    if (req.query.sales_person_profile_id) filters.sales_person_profile_id = req.query.sales_person_profile_id;
    if (req.query.booking_status) filters.booking_status = req.query.booking_status;
    if (req.query.limit) {
      const parsed = Number(req.query.limit);
      if (Number.isFinite(parsed) && parsed > 0) filters.limit = parsed;
    }

    const [data, count] = await Promise.all([
      listCarBookings(filters),
      countCarBookings(filters),
    ]);
    res.status(200).json({ data, count, error: null });
  } catch (error) {
    res.status(500).json({ data: null, count: null, error: { message: (error as Error).message } });
  }
}

export async function getCarBookingController(req: Request, res: Response) {
  try {
    const data = await getCarBookingById(req.params.id);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Car booking not found' } });
      return;
    }
    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function createCarBookingController(req: Request, res: Response) {
  try {
    const data = await createCarBooking(req.body);
    res.status(201).json({ data, error: null });
  } catch (error) {
    res.status(400).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function updateCarBookingController(req: Request, res: Response) {
  try {
    const { action, ...payload } = req.body as { action?: string } & Record<string, unknown>;

    if (action === 'cancel') {
      const data = await cancelCarBooking(req.params.id, payload as any);
      if (!data) {
        res.status(404).json({ data: null, error: { message: 'Booking not found or already cancelled' } });
        return;
      }
      res.status(200).json({ data, error: null });
      return;
    }

    if (action === 'refund') {
      const data = await refundCarBooking(req.params.id, payload as any);
      if (!data) {
        res.status(404).json({ data: null, error: { message: 'Booking not found or already cancelled' } });
        return;
      }
      res.status(200).json({ data, error: null });
      return;
    }

    res.status(400).json({ data: null, error: { message: 'Missing or invalid action. Use "cancel" or "refund".' } });
  } catch (error) {
    res.status(400).json({ data: null, error: { message: (error as Error).message } });
  }
}
