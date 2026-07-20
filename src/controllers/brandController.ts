import { Request, Response } from 'express';
import { createBrand, deleteBrand, getBrandById, listBrands, updateBrand } from '../services/brandService.js';

export async function getBrandsController(req: Request, res: Response) {
  try {
    const filters: Record<string, unknown> = {};
    if (req.query.dealer_id) filters.dealer_id = req.query.dealer_id;
    if (req.query.is_active !== undefined) filters.is_active = req.query.is_active === 'true';
    const data = await listBrands(filters);
    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function getBrandController(req: Request, res: Response) {
  try {
    const data = await getBrandById(req.params.id);
    if (!data) { res.status(404).json({ data: null, error: { message: 'Brand not found' } }); return; }
    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function createBrandController(req: Request, res: Response) {
  try {
    const data = await createBrand(req.body);
    res.status(201).json({ data, error: null });
  } catch (error) {
    res.status(400).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function updateBrandController(req: Request, res: Response) {
  try {
    const data = await updateBrand(req.params.id, req.body);
    if (!data) { res.status(404).json({ data: null, error: { message: 'Brand not found' } }); return; }
    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(400).json({ data: null, error: { message: (error as Error).message } });
  }
}

export async function deleteBrandController(req: Request, res: Response) {
  try {
    await deleteBrand(req.params.id);
    res.status(200).json({ data: { id: req.params.id }, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}
