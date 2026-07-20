/**
 * test-reminders.ts
 * Manual test script for the test drive reminder service.
 *
 * Usage (from apps/api/):
 *   npx tsx scripts/test-reminders.ts [--seed] [--run]
 *
 *   --seed   Insert synthetic test drives (24h-out, 4h-out, no_show, completed)
 *   --run    Trigger all reminder jobs and print stats
 *   Both flags can be combined: npx tsx scripts/test-reminders.ts --seed --run
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('❌  MONGODB_URI not set. Add it to apps/api/.env');
  process.exit(1);
}

const args = process.argv.slice(2);
const SEED = args.includes('--seed');
const RUN  = args.includes('--run');

const CLEAN = args.includes('--clean');

if (!SEED && !RUN && !CLEAN) {
  console.log('Usage: npx tsx scripts/test-reminders.ts [--seed] [--run] [--clean]');
  process.exit(0);
}

await mongoose.connect(MONGO_URI);
console.log('✅  Connected to MongoDB\n');

// ── Lazy-import models after DB is connected ──────────────────────────────────
const { TestDrive } = await import('../src/models/TestDrive.js');
const { Customer }  = await import('../src/models/Customer.js');

// ── Clean ─────────────────────────────────────────────────────────────────────
if (CLEAN) {
  console.log('── Cleaning test drives ─────────────────────────────────────────');
  const result = await TestDrive.deleteMany({ id: /^test-/ });
  console.log(`✅  Deleted ${result.deletedCount} test drive(s)\n`);
}

// ── Seed ──────────────────────────────────────────────────────────────────────
if (SEED) {
  console.log('── Seeding test drives ──────────────────────────────────────────');

  // Find any existing customer to attach the test drives to
  const anyCustomer = await Customer.findOne({}, { id: 1, email: 1 }).lean();
  if (!anyCustomer?.email) {
    console.error('❌  No customers found in DB. Please create one first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const now = new Date();

  const pad = (n: number) => String(n).padStart(2, '0');
  const toDateStr  = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const toTimeStr  = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const uid = () => `test-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

  // 24h-out: scheduled ~24h from now
  const t24h = new Date(now.getTime() + 23 * 3600_000); // 23h → falls in 20–25h window
  const drive24h = {
    id: uid(), customer_id: anyCustomer.id, vehicle_id: 'test-vehicle',
    location_id: 'test-location', assigned_sales_person_id: null,
    scheduled_date: toDateStr(t24h), scheduled_time: toTimeStr(t24h),
    status: 'scheduled',
    reminder_sent_24h: false, reminder_sent_4h: false,
    thank_you_sent: false, no_show_reengagement_sent: false,
    created_at: now.toISOString(), updated_at: now.toISOString(),
  };

  // 4h-out: scheduled ~4h from now
  const t4h = new Date(now.getTime() + 4 * 3600_000);
  const drive4h = {
    id: uid(), customer_id: anyCustomer.id, vehicle_id: 'test-vehicle',
    location_id: 'test-location', assigned_sales_person_id: null,
    scheduled_date: toDateStr(t4h), scheduled_time: toTimeStr(t4h),
    status: 'scheduled',
    reminder_sent_24h: false, reminder_sent_4h: false,
    thank_you_sent: false, no_show_reengagement_sent: false,
    created_at: now.toISOString(), updated_at: now.toISOString(),
  };

  // No-show: status = no_show, updated 30 min ago
  const noShowTime = new Date(now.getTime() - 30 * 60_000);
  const driveNoShow = {
    id: uid(), customer_id: anyCustomer.id, vehicle_id: 'test-vehicle',
    location_id: 'test-location', assigned_sales_person_id: null,
    scheduled_date: toDateStr(now), scheduled_time: toTimeStr(now),
    status: 'no_show',
    reminder_sent_24h: true, reminder_sent_4h: true,
    thank_you_sent: false, no_show_reengagement_sent: false,
    created_at: noShowTime.toISOString(), updated_at: noShowTime.toISOString(),
  };

  // Completed: updated 45 min ago
  const completedTime = new Date(now.getTime() - 45 * 60_000);
  const driveCompleted = {
    id: uid(), customer_id: anyCustomer.id, vehicle_id: 'test-vehicle',
    location_id: 'test-location', assigned_sales_person_id: null,
    scheduled_date: toDateStr(now), scheduled_time: toTimeStr(now),
    status: 'completed',
    reminder_sent_24h: true, reminder_sent_4h: true,
    thank_you_sent: false, no_show_reengagement_sent: false,
    created_at: completedTime.toISOString(), updated_at: completedTime.toISOString(),
  };

  await TestDrive.insertMany([drive24h, drive4h, driveNoShow, driveCompleted]);

  console.log(`✅  Inserted 4 test drives for customer: ${anyCustomer.email}`);
  console.log(`   → 24h reminder:  id=${drive24h.id}  scheduled at ${drive24h.scheduled_date} ${drive24h.scheduled_time}`);
  console.log(`   → 4h reminder:   id=${drive4h.id}  scheduled at ${drive4h.scheduled_date} ${drive4h.scheduled_time}`);
  console.log(`   → no_show:       id=${driveNoShow.id}`);
  console.log(`   → completed:     id=${driveCompleted.id}\n`);
}

// ── Run jobs ──────────────────────────────────────────────────────────────────
if (RUN) {
  console.log('── Running reminder jobs ────────────────────────────────────────');
  const { runTestDriveReminderJobs } = await import('../src/services/testDriveReminderService.js');

  console.time('jobs');
  const stats = await runTestDriveReminderJobs();
  console.timeEnd('jobs');

  console.log('\n── Results ─────────────────────────────────────────────────────');
  console.table(stats);
  console.log('');
}

await mongoose.disconnect();
console.log('Disconnected. Done.');
