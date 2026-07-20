import { Request, Response } from 'express';
import { listFiles, publicUrl, removeFiles, saveFile } from '../services/storageService.js';

export async function uploadController(req: Request, res: Response) {
  try {
    const bucket = req.params.bucket;
    const filePath = String(req.body.path || '');
    const upsert = req.body.upsert === 'true' || req.body.upsert === true;

    if (!req.file) {
      res.status(400).json({ data: null, error: { message: 'File is required' } });
      return;
    }

    const data = await saveFile(bucket, filePath, req.file, upsert);
    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    res.status(400).json({ data: null, error: { message } });
  }
}

export async function listController(req: Request, res: Response) {
  try {
    const bucket = req.params.bucket;
    const prefix = String(req.query.prefix || '');
    const limit = Number(req.query.limit || 100);
    const data = await listFiles(bucket, prefix, limit);
    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'List failed';
    res.status(400).json({ data: null, error: { message } });
  }
}

export function publicUrlController(req: Request, res: Response) {
  try {
    const bucket = req.params.bucket;
    const filePath = String(req.body.path || req.params[0] || '');
    const data = { publicUrl: publicUrl(bucket, filePath) };
    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Public URL generation failed';
    res.status(400).json({ data: null, error: { message } });
  }
}

export function signedUrlController(req: Request, res: Response) {
  try {
    const bucket = req.params.bucket;
    const filePath = String(req.body.path || '');
    const data = { signedUrl: publicUrl(bucket, filePath) };
    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Signed URL generation failed';
    res.status(400).json({ data: null, error: { message } });
  }
}

export async function removeController(req: Request, res: Response) {
  try {
    const bucket = req.params.bucket;
    const paths = Array.isArray(req.body?.paths) ? req.body.paths.map(String) : [];
    const data = await removeFiles(bucket, paths);
    res.status(200).json({ data, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'File removal failed';
    res.status(400).json({ data: null, error: { message } });
  }
}
