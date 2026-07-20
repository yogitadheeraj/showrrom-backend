import { Request, Response } from 'express';
import { createLocation, deleteLocation, getLocationById, listLocations, updateLocation } from '../services/locationService.js';

export async function getLocationsController(req: Request, res: Response) {
  try {
    const filters: Record<string, unknown> = {};
    if (req.query.dealer_id) filters.dealer_id = req.query.dealer_id;
    if (req.query.brandId) filters.brandId = req.query.brandId;
    if (req.query.businessUnitId) filters.businessUnitId = req.query.businessUnitId;
    if (req.query.salesOfficeId) filters.salesOfficeId = req.query.salesOfficeId;
    if (req.query.plantId) filters.plantId = req.query.plantId;
    if (req.query.is_active !== undefined) filters.is_active = req.query.is_active === 'true';
    const data = await listLocations(filters);
    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function getLocationController(req: Request, res: Response) {
  try {
    const data = await getLocationById(req.params.id);
    if (!data) { res.status(404).json({ data: null, error: { message: 'Location not found' } }); return; }
    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function createLocationController(req: Request, res: Response) {
  try {
    const data = await createLocation(req.body);
    res.status(201).json({ data, error: null });
  } catch (error) {
    res.status(400).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function updateLocationController(req: Request, res: Response) {
  try {
    const data = await updateLocation(req.params.id, req.body);
    if (!data) { res.status(404).json({ data: null, error: { message: 'Location not found' } }); return; }
    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(400).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function deleteLocationController(req: Request, res: Response) {
  try {
    await deleteLocation(req.params.id);
    res.status(200).json({ data: { id: req.params.id }, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}
