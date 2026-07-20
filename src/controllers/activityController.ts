import { Request, Response } from 'express';
import * as activityService from '../services/activityService.js';

// ── Events ────────────────────────────────────────────────────────────────────

export async function listEventsController(req: Request, res: Response) {
  const limit = Number(req.query.limit) || 200;
  const filters: Record<string, unknown> = { ...req.query };
  if (req.query.event_types) filters.event_types = req.query.event_types;
  if (req.query.role) filters.role = req.query.role;
  const data = await activityService.listEvents(filters, limit);
  res.json({ data });
}

export async function logEventController(req: Request, res: Response) {
  const data = await activityService.logEvent(req.body);
  res.status(201).json({ data });
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function startSessionController(req: Request, res: Response) {
  const data = await activityService.startSession(req.body);
  res.status(201).json({ data });
}

export async function endSessionController(req: Request, res: Response) {
  await activityService.endSession(req.params.id);
  res.json({ success: true });
}

export async function touchSessionController(req: Request, res: Response) {
  const { active_seconds = 0, idle_seconds = 0 } = req.body;
  await activityService.touchSession(req.params.id, Number(active_seconds), Number(idle_seconds));
  res.json({ success: true });
}

export async function listOnlineSessionsController(req: Request, res: Response) {
  const filters: Record<string, unknown> = {};
  if (req.query.location_id) filters.location_id = req.query.location_id as string;
  const locationIds = filters.location_ids as string[] | undefined;
  const locationId = filters.location_id as string | undefined;
  const data = await activityService.listOnlineSessions(locationId, locationIds);
  res.json({ data });
}
