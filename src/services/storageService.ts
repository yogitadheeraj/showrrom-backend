import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

function sanitizePath(input: string) {
  const value = input.replace(/\\/g, '/').replace(/^\/+/, '');
  if (value.includes('..')) {
    throw new Error('Invalid path');
  }
  return value;
}

function bucketRoot(bucket: string) {
  return path.join(env.storageRoot, sanitizePath(bucket));
}

export async function saveFile(bucket: string, filePath: string, file: Express.Multer.File, upsert = false) {
  const safeFilePath = sanitizePath(filePath);
  const target = path.join(bucketRoot(bucket), safeFilePath);
  const dir = path.dirname(target);

  await fs.mkdir(dir, { recursive: true });

  if (!upsert) {
    try {
      await fs.stat(target);
      throw new Error('File already exists');
    } catch {
      // If stat fails, file does not exist.
    }
  }

  await fs.writeFile(target, file.buffer);

  return { path: safeFilePath, fullPath: target };
}

export async function listFiles(bucket: string, prefix = '', limit = 100) {
  const root = path.join(bucketRoot(bucket), sanitizePath(prefix || ''));

  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .slice(0, limit)
      .map((entry) => ({ name: entry.name, id: entry.name }));
  } catch {
    return [];
  }
}

export async function removeFiles(bucket: string, paths: string[]) {
  const removed: string[] = [];

  for (const entry of paths) {
    const safe = sanitizePath(entry);
    const target = path.join(bucketRoot(bucket), safe);

    try {
      await fs.unlink(target);
      removed.push(safe);
    } catch {
      // Ignore not found files for compatibility.
    }
  }

  return removed;
}

export function publicUrl(bucket: string, filePath: string) {
  const safe = sanitizePath(filePath);
  return `${env.publicApiUrl}/uploads/${sanitizePath(bucket)}/${safe}`;
}
