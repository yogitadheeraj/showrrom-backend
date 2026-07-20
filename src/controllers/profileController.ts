import { Request, Response } from 'express';
import * as profileService from '../services/profileService.js';

export async function getProfileController(req: Request, res: Response) {
  const { id } = req.params;
  const data = await profileService.getProfileById(id);
  if (!data) return res.status(404).json({ error: 'Profile not found' });
  res.json({ data });
}

export async function getMyProfileController(req: Request, res: Response) {
  const uid = req.authUser?.uid;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  const data = await profileService.getProfileByUserId(uid);
  if (!data) return res.status(404).json({ error: 'Profile not found' });
  res.json({ data });
}

export async function listProfilesController(req: Request, res: Response) {
  const data = await profileService.listProfiles(req.query as Record<string, unknown>);
  res.json({ data });
}

export async function upsertProfileController(req: Request, res: Response) {
  const data = await profileService.upsertProfile(req.body);
  res.json({ data });
}

export async function updateProfileController(req: Request, res: Response) {
  const data = await profileService.updateProfile(req.params.id, req.body);
  if (!data) return res.status(404).json({ error: 'Profile not found' });
  res.json({ data });
}

export async function clearExpiredLeavesController(req: Request, res: Response) {
  try {
    const count = await profileService.clearExpiredLeaves();
    res.json({ data: { cleared: count } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
