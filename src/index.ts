import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { getApps, deleteApp } from 'firebase-admin/app';
import { env } from './config/env.js';
import { initFirebaseAdmin } from './config/firebaseAdmin.js';
import { attachAuthUser } from './middleware/auth.js';
import { apiRouter } from './routes/index.js';
import { Vehicle } from './models/Vehicle.js';
import { processEmailQueues } from './services/emailProcessorService.js';
import { runTestDriveReminderJobs } from './services/testDriveReminderService.js';

const app = express();

const normalizeOrigin = (value?: string) => {
  if (!value) return '';
  return value.trim().replace(/^['"]|['"]$/g, '').replace(/\/$/, '').toLowerCase();
};

const allowedOrigins = new Set(
  [...env.corsOrigins, env.corsOrigin]
    .map(normalizeOrigin)
    .filter(Boolean),
);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const normalizedOrigin = normalizeOrigin(origin);
    if (allowedOrigins.has(normalizedOrigin) || allowedOrigins.has('*')) {
      return callback(null, true);
    }

    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(attachAuthUser);
app.use('/uploads', express.static(env.storageRoot));

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'api' });
});

app.use('/api', apiRouter);

async function start() {
  if (!env.mongoUri) {
    throw new Error('MONGODB_URI is required. Copy apps/api/.env.example to apps/api/.env');
  }

  initFirebaseAdmin();
  await mongoose.connect(env.mongoUri);

  try {
    await mongoose.connection.collection('vehicles').dropIndex('vin_1').catch(() => undefined);
    await mongoose.connection.collection('vehicles').dropIndex('vin_sparse_idx').catch(() => undefined);
    await Vehicle.syncIndexes();
  } catch (error) {
    console.warn('[vehicle-indexes] Failed to sync vehicle indexes:', error);
  }

  // Background email queue processor — runs every 30 seconds
  const EMAIL_PROCESSOR_INTERVAL_MS = 30_000;
  const emailInterval = setInterval(async () => {
    try {
      const result = await processEmailQueues();
      if (result.processed > 0) {
        console.log(`[emailProcessor] Processed ${result.processed} emails`);
      }
    } catch (err) {
      console.error('[emailProcessor] Error during queue processing', err);
    }
  }, EMAIL_PROCESSOR_INTERVAL_MS);

  // Test drive reminder scheduler — runs every 15 minutes
  const REMINDER_INTERVAL_MS = 15 * 60_000;
  // Run once immediately on startup to catch any missed reminders
  void runTestDriveReminderJobs();
  const reminderInterval = setInterval(() => {
    void runTestDriveReminderJobs();
  }, REMINDER_INTERVAL_MS);

  const server = app.listen(env.port, () => {
    console.log(`API listening on http://0.0.0.0:${env.port}`);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[startup] Port ${env.port} is already in use.`);
      process.exit(1);
    }
    throw error;
  });

  async function shutdown(signal: string) {
    console.log(`[shutdown] ${signal} received — closing gracefully`);
    clearInterval(emailInterval);
    clearInterval(reminderInterval);
    server.close();
    await mongoose.disconnect();
    const apps = getApps();
    if (apps.length) await deleteApp(apps[0]);
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error('Failed to start API', error);
  process.exit(1);
});