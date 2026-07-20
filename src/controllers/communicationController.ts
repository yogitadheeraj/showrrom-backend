import { Request, Response } from 'express';
import * as communicationService from '../services/communicationService.js';

export async function listCommunicationsController(req: Request, res: Response) {
  const limit = Number(req.query.limit) || 200;
  const data = await communicationService.listCommunications(req.query as Record<string, unknown>, limit);
  res.json({ data });
}

export async function createCommunicationController(req: Request, res: Response) {
  const data = await communicationService.createCommunication(req.body);
  res.status(201).json({ data });
}

export async function updateCommunicationStatusController(req: Request, res: Response) {
  const { status, ...extra } = req.body;
  const data = await communicationService.updateCommunicationStatus(req.params.id, status, extra);
  if (!data) return res.status(404).json({ error: 'Communication not found' });
  res.json({ data });
}

export async function updateCommunicationController(req: Request, res: Response) {
  const data = await communicationService.updateCommunication(req.params.id, req.body);
  if (!data) return res.status(404).json({ error: 'Communication not found' });
  res.json({ data });
}
