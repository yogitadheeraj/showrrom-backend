import { Request, Response } from 'express';
import * as dealerService from '../services/dealerService.js';

export async function listDealersController(req: Request, res: Response) {
  const data = await dealerService.listDealers(req.query as Record<string, unknown>);
  res.json({ data });
}

export async function getDealerController(req: Request, res: Response) {
  const data = await dealerService.getDealerById(req.params.id);
  if (!data) return res.status(404).json({ error: 'Dealer not found' });
  res.json({ data });
}

/** Public — no auth required. Returns only safe branding fields. */
export async function getDealerBrandingController(req: Request, res: Response) {
  const dealer = await dealerService.getDealerBySlug(req.params.slug);
  if (!dealer) return res.status(404).json({ error: 'Dealer not found' });
  res.json({
    data: {
      id:        dealer.id,
      name:      dealer.name,
      slug:      dealer.slug,
      logo_url:  dealer.logo_url ?? null,
      primary_color: (dealer as any).primary_color ?? null,
      tagline:   (dealer as any).tagline ?? null,
    },
  });
}

export async function createDealerController(req: Request, res: Response) {
  const data = await dealerService.createDealer(req.body);
  res.status(201).json({ data });
}

export async function updateDealerController(req: Request, res: Response) {
  const data = await dealerService.updateDealer(req.params.id, req.body);
  if (!data) return res.status(404).json({ error: 'Dealer not found' });
  res.json({ data });
}

export async function deleteDealerController(req: Request, res: Response) {
  await dealerService.deleteDealer(req.params.id);
  res.status(204).end();
}
