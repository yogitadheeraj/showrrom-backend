import { Request } from 'express';

/**
 * Roles that are scoped to a single assigned location.
 * API list/count queries will be automatically restricted to their location_id.
 */
const LOCATION_SCOPED_ROLES = new Set([
  'gro',
  'sales',
  'sales_admin',
  'branch_admin',
  'security',
]);

/**
 * Mutates `filters` to enforce location/dealer scope for the requesting user.
 *
 * - Staff roles (gro, sales, sales_admin, branch_admin, security):
 *     Forces `location_id` to the user's assigned location. Any `location_ids`
 *     param from the query string is also removed to prevent scope bypass.
 * - dealer_admin:
 *     Forces `location_ids` to all location IDs under their dealer, OR falls
 *     back to `dealer_id` filter for services that support it directly
 *     (e.g. locationService). Removes any conflicting query-supplied filters.
 * - superadmin / unauthenticated: no automatic filter added.
 *
 * Call this in list/count controller handlers after building initial filters
 * from req.query, before passing filters to the service layer.
 */
export function applyLocationScope(
  req: Request,
  filters: Record<string, unknown>,
): void {
  const role = req.authUser?.role;
  const locationId = req.authUser?.location_id;

  if (!role) return;

  if (LOCATION_SCOPED_ROLES.has(role)) {
    if (locationId) {
      filters.location_id = locationId;
      delete filters.location_ids;
    }
  }
  const { location_id} = req.query as Record<string, string>;
  if (role === 'dealer_admin' && req.authUser?.dealer_id && !location_id) {
    const dealerLocationIds = req.authUser?.dealer_location_ids;
    const dealerId = req.authUser?.dealer_id;

    // Honour a specific location selection sent by the client (validated against dealer's locations)
    const requestedLocId = req.headers['x-selected-location-id'] as string | undefined;
    const effectiveLocationIds =
      requestedLocId && dealerLocationIds?.includes(requestedLocId)
        ? [requestedLocId]
        : dealerLocationIds;

    if (effectiveLocationIds && effectiveLocationIds.length > 0) {
      filters.location_ids = effectiveLocationIds;
      delete filters.location_id;
      if (dealerId) filters.dealer_id = dealerId;
    } else if (dealerId) {
      filters.dealer_id = dealerId;
    }
  }
}
