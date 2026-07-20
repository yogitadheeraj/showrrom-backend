/**
 * OAuth controller for Google Calendar and Microsoft Outlook integrations.
 *
 * Flow:
 *  1. Dealer clicks "Connect" in the UI → GET /api/integrations/oauth/:provider/start?dealer_id=XXX
 *     → redirects to provider's authorization page
 *  2. Provider redirects back → GET /api/integrations/oauth/:provider/callback?code=XXX&state=XXX
 *     → exchanges code for tokens, saves to DealerIntegration, closes popup / redirects to settings
 *
 * State parameter: HMAC-signed JSON { dealer_id, nonce, ts } — prevents CSRF
 */

import { createHmac, randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import { env } from '../config/env.js';
import { upsertIntegration } from '../services/integrationService.js';

// ─── State helpers ────────────────────────────────────────────────────────────

function signState(payload: Record<string, string>): string {
  const json = JSON.stringify(payload);
  const sig = createHmac('sha256', env.oauthStateSecret).update(json).digest('hex');
  return Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url');
}

function verifyState(state: string): Record<string, string> | null {
  try {
    const raw = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as { p: Record<string, string>; s: string };
    const expected = createHmac('sha256', env.oauthStateSecret).update(JSON.stringify(raw.p)).digest('hex');
    if (expected !== raw.s) return null;
    // Expire state after 10 minutes
    if (Date.now() - Number(raw.p.ts) > 10 * 60 * 1000) return null;
    return raw.p;
  } catch {
    return null;
  }
}

// ─── Provider configs ─────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const OUTLOOK_AUTH_URL = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`;
const OUTLOOK_TOKEN_URL = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
const OUTLOOK_SCOPE = 'Calendars.ReadWrite offline_access';

function redirectUri(req: Request, provider: string): string {
  const base = env.publicApiUrl.replace(/\/$/, '');
  return `${base}/api/integrations/oauth/${provider}/callback`;
}

// ─── Start handlers ───────────────────────────────────────────────────────────

export function startGoogleOAuth(req: Request, res: Response) {
  const dealerId = 'd10619e4-f116-4ef3-887d-93e12372d746'; // (req.query.dealer_id as string) || (req.authUser as any)?.dealer_id;
  if (!dealerId) return res.status(400).send('dealer_id required');
  if (!env.googleOAuthClientId) return res.status(501).send('GOOGLE_OAUTH_CLIENT_ID not configured');

  const state = signState({ dealer_id: dealerId, nonce: randomBytes(8).toString('hex'), ts: String(Date.now()) });
  const params = new URLSearchParams({
    client_id:     env.googleOAuthClientId,
    redirect_uri:  redirectUri(req, 'google'),
    response_type: 'code',
    scope:         GOOGLE_SCOPE,
    access_type:   'offline',
    prompt:        'consent',  // force refresh_token on every authorization
    state,
  });
  res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
}

export function startOutlookOAuth(req: Request, res: Response) {
  const dealerId = (req.query.dealer_id as string) || (req.authUser as any)?.dealer_id;
  if (!dealerId) return res.status(400).send('dealer_id required');
  if (!env.outlookOAuthClientId) return res.status(501).send('OUTLOOK_OAUTH_CLIENT_ID not configured');

  const state = signState({ dealer_id: dealerId, nonce: randomBytes(8).toString('hex'), ts: String(Date.now()) });
  const params = new URLSearchParams({
    client_id:     env.outlookOAuthClientId,
    redirect_uri:  redirectUri(req, 'outlook'),
    response_type: 'code',
    scope:         OUTLOOK_SCOPE,
    state,
  });
  res.redirect(`${OUTLOOK_AUTH_URL(env.outlookOAuthTenantId)}?${params}`);
}

// ─── Callback handlers ────────────────────────────────────────────────────────

const FRONTEND_SETTINGS_URL = (origin: string) => `${origin}/settings?tab=integrations`;

function closingHtml(success: boolean, message: string): string {
  return `<!DOCTYPE html><html><body>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'oauth_callback', success: ${success}, message: ${JSON.stringify(message)} }, '*');
        window.close();
      } else {
        document.write(${JSON.stringify(`<p>${message}. You may close this tab.</p>`)});
      }
    </script>
    <p>${message}</p>
  </body></html>`;
}

export async function googleOAuthCallback(req: Request, res: Response) {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    return res.send(closingHtml(false, `Google authorization denied: ${error}`));
  }

  const stateData = verifyState(state ?? '');
  if (!stateData) return res.status(400).send(closingHtml(false, 'Invalid or expired OAuth state'));

  const { dealer_id: dealerId } = stateData;

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri(req, 'google'),
        client_id:     env.googleOAuthClientId,
        client_secret: env.googleOAuthClientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Token exchange failed: ${text}`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    if (!tokens.refresh_token) {
      throw new Error('No refresh_token returned. Please revoke access in your Google account and try again.');
    }

    await upsertIntegration(dealerId, {
      type: 'google_calendar',
      is_enabled: true,
      config: {
        client_id:     env.googleOAuthClientId,
        client_secret: env.googleOAuthClientSecret,
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token,
      },
    });

    res.send(closingHtml(true, '✅ Google Calendar connected successfully!'));
  } catch (err) {
    res.send(closingHtml(false, `Failed to connect Google Calendar: ${(err as Error).message}`));
  }
}

export async function outlookOAuthCallback(req: Request, res: Response) {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    return res.send(closingHtml(false, `Microsoft authorization denied: ${error}`));
  }

  const stateData = verifyState(state ?? '');
  if (!stateData) return res.status(400).send(closingHtml(false, 'Invalid or expired OAuth state'));

  const { dealer_id: dealerId } = stateData;

  try {
    const tokenRes = await fetch(OUTLOOK_TOKEN_URL(env.outlookOAuthTenantId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri(req, 'outlook'),
        client_id:     env.outlookOAuthClientId,
        client_secret: env.outlookOAuthClientSecret,
        scope:         OUTLOOK_SCOPE,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Token exchange failed: ${text}`);
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    if (!tokens.refresh_token) {
      throw new Error('No refresh_token returned. Ensure offline_access scope is requested.');
    }

    await upsertIntegration(dealerId, {
      type: 'outlook',
      is_enabled: true,
      config: {
        client_id:     env.outlookOAuthClientId,
        client_secret: env.outlookOAuthClientSecret,
        tenant_id:     env.outlookOAuthTenantId,
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token,
      },
    });

    res.send(closingHtml(true, '✅ Microsoft Outlook connected successfully!'));
  } catch (err) {
    res.send(closingHtml(false, `Failed to connect Outlook: ${(err as Error).message}`));
  }
}
