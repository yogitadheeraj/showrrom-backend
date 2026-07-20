import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from './env.js';

let initialized = false;

export function initFirebaseAdmin() {
  if (initialized || getApps().length > 0) {
    initialized = true;
    return;
  }

  if (!env.firebaseProjectId || !env.firebaseClientEmail || !env.firebasePrivateKey) {
    console.warn('Firebase Admin credentials are not configured. Auth token verification is disabled.');
    return;
  }

  initializeApp({
    credential: cert({
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey,
    }),
    databaseURL: env.firebaseDatabaseUrl || `https://${env.firebaseProjectId}-default-rtdb.asia-southeast1.firebasedatabase.app`,
  });

  initialized = true;
}

export function verifyIdToken(idToken: string) {
  if (!getApps().length) {
    throw new Error('Firebase Admin is not initialized.');
  }

  return getAuth().verifyIdToken(idToken);
}
