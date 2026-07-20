import { Request, Response } from 'express';
import * as brandLocationService from '../services/brandLocationService.js';

export async function listBrandsWithLocationsController(req: Request, res: Response) {
  try {
    const filters: Record<string, unknown> = {};
    if (req.query.orgId) filters.orgId = req.query.orgId;
    if (req.query.dealer_id) filters.dealer_id = req.query.dealer_id;
    if (req.query.businessUnitId) filters.businessUnitId = req.query.businessUnitId;
    const data = await brandLocationService.listBrandsWithLocations(filters);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: { message: (err as Error).message } });
  }
}

export async function updateBrandBusinessUnitController(req: Request, res: Response) {
  try {
    const data = await brandLocationService.updateBrandBusinessUnit(
      req.params.id,
      req.body.businessUnitId ?? null,
    );
    if (!data) return res.status(404).json({ error: { message: 'Brand not found' } });
    res.json({ data });
  } catch (err) {
    res.status(400).json({ error: { message: (err as Error).message } });
  }
}

export async function listBrandLocationsController(req: Request, res: Response) {
  try {
    const filters: Record<string, unknown> = {};
    if (req.query.orgId) filters.orgId = req.query.orgId;
    if (req.query.brandId) filters.brandId = req.query.brandId;
    if (req.query.locationId) filters.locationId = req.query.locationId;
    const data = await brandLocationService.listBrandLocations(filters);
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: { message: (err as Error).message } });
  }
}

export async function linkBrandLocationController(req: Request, res: Response) {
  try {
    const data = await brandLocationService.linkBrandLocation(req.body);
    res.status(201).json({ data });
  } catch (err) {
    res.status(400).json({ error: { message: (err as Error).message } });
  }
}

export async function unlinkBrandLocationController(req: Request, res: Response) {
  try {
    const { brandId, locationId } = req.params;
    const orgId = req.query.orgId as string;
    if (!orgId) return res.status(400).json({ error: { message: 'orgId is required' } });
    await brandLocationService.unlinkBrandLocation(orgId, brandId, locationId);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: { message: (err as Error).message } });
  }
}
