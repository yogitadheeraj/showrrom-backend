/**
 * Seed script: creates (or updates) a superadmin UserRole + Profile for a given email.
 *
 * Usage:
 *   npx tsx src/scripts/seedSuperadmin.ts yogitadheerajvarshney@gmail.com
 *
 * The Firebase user must already exist (signed up at least once).
 * Run from inside apps/api/.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { initFirebaseAdmin } from '../config/firebaseAdmin.js';
import { getAuth } from 'firebase-admin/auth';
import { UserRole } from '../models/UserRole.js';
import { Profile } from '../models/Profile.js';

const email = process.argv[2] || 'yogitadheerajvarshney@gmail.com';

async function main() {
  console.log(`Seeding superadmin for: ${email}`);

  // Connect to MongoDB
  if (!env.mongoUri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(env.mongoUri);
  console.log('Connected to MongoDB');

  // Initialize Firebase Admin
  initFirebaseAdmin();

  // Look up Firebase user by email — create if not found
  let firebaseUser: import('firebase-admin/auth').UserRecord;
  try {
    firebaseUser = await getAuth().getUserByEmail(email);
    console.log('Found existing Firebase user');
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      console.log('Firebase user not found — creating new user...');
      const tempPassword = `SuperAdmin@${Math.random().toString(36).slice(2, 10)}!`;
      firebaseUser = await getAuth().createUser({
        email,
        displayName: 'Super Admin',
        password: tempPassword,
        emailVerified: true,
      });
      console.log(`Firebase user created. Temporary password: ${tempPassword}`);
      console.log('Please change this password after first login via Firebase Console or the app.');
    } else {
      throw err;
    }
  }

  const uid = firebaseUser.uid;
  console.log(`Found Firebase UID: ${uid}`);

  // Upsert UserRole → superadmin
  await UserRole.findOneAndUpdate(
    { user_id: uid },
    { $set: { user_id: uid, role: 'superadmin' }, $setOnInsert: { id: randomUUID() } },
    { upsert: true, new: true },
  );
  console.log('UserRole set to superadmin ✓');

  // Upsert Profile (no location_id — superadmin is global)
  const now = new Date().toISOString();
  await Profile.findOneAndUpdate(
    { user_id: uid },
    {
      $set: {
        full_name: firebaseUser.displayName || 'Super Admin',
        email,
        is_active: true,
        updated_at: now,
      },
      $setOnInsert: {
        id: randomUUID(),
        user_id: uid,
        location_id: null,
        phone: null,
        avatar_url: null,
        on_leave: false,
        leave_start_date: null,
        leave_end_date: null,
        last_login_at: null,
        created_at: now,
      },
    },
    { upsert: true, new: true },
  );
  console.log('Profile upserted ✓');

  console.log(`\nDone! ${email} is now a superadmin.`);
  console.log('They can log in and will have access to the superadmin integration monitoring view.');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
