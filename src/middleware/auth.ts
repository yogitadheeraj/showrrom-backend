import { Request, Response, NextFunction } from 'express';
import { verifyIdToken } from '../config/firebaseAdmin.js';
import { UserRole } from '../models/UserRole.js';
import { Profile } from '../models/Profile.js';
import { Location } from '../models/Location.js';
import { applyLocationScope } from '../middleware/locationFilter.js';

import { z } from 'zod';

const filterSchema = z.object({
  field: z.string().min(1),
  op: z.enum(['eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is']),
  value: z.unknown(),
});

const orderSchema = z.object({
  field: z.string().min(1),
  ascending: z.boolean().optional(),
});

const querySchema = z.object({
  table: z.string().min(1),
  action: z.enum(['select', 'insert', 'update', 'delete', 'upsert']),
  select: z.string().optional(),
  filters: z.array(filterSchema).optional(),
  order: z.array(orderSchema).optional(),
  limit: z.number().int().positive().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  values: z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown()))]).optional(),
  options: z
    .object({
      count: z.union([z.literal('exact'), z.null()]).optional(),
      head: z.boolean().optional(),
      onConflict: z.string().optional(),
      ignoreDuplicates: z.boolean().optional(),
    })
    .optional(),
});
declare global {
  namespace Express {
    interface Request {
      authUser?: {
        uid: string;
        email?: string;
        role?: string;
        location_id?: string | null;
        dealer_id?: string | null;
        /** All location IDs belonging to the dealer — populated for dealer_admin only */
        dealer_location_ids?: string[];
      };
    }
  }
}

export async function attachAuthUser(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const decoded = await verifyIdToken(token);
    req.authUser = {
      uid: decoded.uid,
      email: decoded.email,
    };

    // Load role and location context for location-based filtering
    try {
      const [roleDoc, profileDoc] = await Promise.all([
        UserRole.findOne({ user_id: decoded.uid }, { role: 1 }).lean(),
        Profile.findOne({ user_id: decoded.uid }, { location_id: 1 }).lean(),
      ]);
      req.authUser.role = (roleDoc?.role as string | undefined) ?? undefined;
      req.authUser.location_id = (profileDoc as any)?.location_id ?? null;

      // Resolve dealer_id via the user's assigned location
      if (req.authUser.location_id) {
        const locDoc = await Location.findOne(
          { id: req.authUser.location_id },
          { dealer_id: 1 },
        ).lean();
        req.authUser.dealer_id = (locDoc as any)?.dealer_id ?? null;

        // For dealer_admin: also collect all location IDs under their dealer
        if (req.authUser.role === 'dealer_admin' && req.authUser.dealer_id) {
          const allLocs = await Location.find(
            { dealer_id: req.authUser.dealer_id },
            { id: 1 },
          ).lean();
          req.authUser.dealer_location_ids = allLocs
            .map((l: any) => l.id)
            .filter(Boolean);
        }
      }
    } catch {
      // Non-fatal: role/profile lookup failure
    }
  } catch {
    // Allow anonymous requests for public endpoints.
  }

  next();
}

type ParsedQuery = z.infer<typeof querySchema>;
type FilterEntry = z.infer<typeof filterSchema>;

/** Tables whose rows are scoped to a single showroom via `location_id`. */
const LOCATION_SCOPED_TABLES = new Set([
  'staff_activity_events',
  'staff_activity_sessions',
  'test_drives',
  'vehicles',
  'profiles',
  'location_blocked_slots',
  'location_operating_hours',
  'location_special_periods',
]);

/** Tables scoped to a dealer group via `dealer_id`. */
const DEALER_SCOPED_TABLES = new Set(['locations']);

/** Staff roles that are restricted to their single assigned location. */
const LOCATION_SCOPED_ROLES = new Set([
  'gro', 'sales', 'sales_admin', 'branch_admin', 'security',
]);

/**
 * Injects location / dealer scope filters into the query body for `select`
 * actions, overriding any conflicting filters supplied by the client.
 */
function enforceScope(body: ParsedQuery, req: Request): void {
  if (body.action !== 'select') return;

  const role = req.authUser?.role;
  if (!role) return;

  const existing = body.filters ?? [];

  if (LOCATION_SCOPED_ROLES.has(role)) {
    const locationId = req.authUser?.location_id;
    if (!locationId) return;

    if (LOCATION_SCOPED_TABLES.has(body.table)) {
      const scoped: FilterEntry[] = [
        ...existing.filter((f) => f.field !== 'location_id'),
        { field: 'location_id', op: 'eq', value: locationId },
      ];
      (body as any).filters = scoped;
    } else if (DEALER_SCOPED_TABLES.has(body.table)) {
      // For locations table: scope to just their own location row
      const scoped: FilterEntry[] = [
        ...existing.filter((f) => f.field !== 'id'),
        { field: 'id', op: 'eq', value: locationId },
      ];
      (body as any).filters = scoped;
    }
    return;
  }

  if (role === 'dealer_admin') {
    const dealerLocationIds = req.authUser?.dealer_location_ids;
    const dealerId = req.authUser?.dealer_id;

    if (LOCATION_SCOPED_TABLES.has(body.table) && dealerLocationIds?.length) {
      const scoped: FilterEntry[] = [
        ...existing.filter((f) => f.field !== 'location_id'),
        { field: 'location_id', op: 'in', value: dealerLocationIds },
      ];
      (body as any).filters = scoped;
    } else if (DEALER_SCOPED_TABLES.has(body.table) && dealerId) {
      const scoped: FilterEntry[] = [
        ...existing.filter((f) => f.field !== 'dealer_id'),
        { field: 'dealer_id', op: 'eq', value: dealerId },
      ];
      (body as any).filters = scoped;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.authUser?.uid) {
        res.status(401).json({ error: { message: 'Unauthorized' } });
        return;
    }
    const filters = req.query as Record<string, unknown>;
    applyLocationScope(req, filters); // Pre-apply location scope for any downstream handlers that rely on req.authUser context
    next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.authUser?.uid) {
        res.status(401).json({ error: { message: 'Unauthorized' } });
        return;
    }
    if (req.authUser.role !== 'superadmin' && req.authUser.role !== 'super_admin') {
        res.status(403).json({ error: { message: 'Superadmin access required' } });
        return;
    }
    next();
}
