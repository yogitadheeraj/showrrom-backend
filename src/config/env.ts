import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const parseOrigins = (value?: string) =>
  (value || 'http://localhost:8080,http://localhost:8081, https://www.autoadvant.com, https://autoadvant.com, https://autoadvant-staging.web.app, https://autoadvant-staging.firebaseapp.com, https://autoadvant.web.app, https://autoadvant.firebaseapp.com')
    .split(',')
    .map((origin) => origin.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || '',
  corsOrigin: parseOrigins(process.env.CORS_ORIGIN || process.env.CORS_ORIGINS)[0] || 'http://localhost:8080',
  corsOrigins: Array.from(new Set(parseOrigins(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || 'http://localhost:8080,http://localhost:8081'))),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || '',
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
  firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  firebaseDatabaseUrl: process.env.FIREBASE_DATABASE_URL || '',
  storageRoot: process.env.STORAGE_ROOT
    ? path.resolve(process.env.STORAGE_ROOT)
    : path.resolve(appRoot, 'uploads'),
  publicApiUrl: process.env.PUBLIC_API_URL || 'http://localhost:4000',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 0),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  mailFrom: process.env.MAIL_FROM || '',
  // OAuth — Google Calendar
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  // OAuth — Microsoft (Outlook)
  outlookOAuthClientId: process.env.OUTLOOK_OAUTH_CLIENT_ID || '',
  outlookOAuthClientSecret: process.env.OUTLOOK_OAUTH_CLIENT_SECRET || '',
  outlookOAuthTenantId: process.env.OUTLOOK_OAUTH_TENANT_ID || 'common',
  // OAuth state signing secret
  oauthStateSecret: process.env.OAUTH_STATE_SECRET || 'change-me-in-production',
  // Public frontend URL (used for customer-facing links in emails)
  publicFrontendUrl: process.env.PUBLIC_FRONTEND_URL || 'http://localhost:8080',
};
