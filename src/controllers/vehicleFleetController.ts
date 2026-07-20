import { Request, Response } from 'express';
import * as fleetService from '../services/vehicleFleetService.js';

/** GET /api/fleet/overview — list all shared vehicles with status */
export async function fleetOverviewController(req: Request, res: Response) {
  try {
    const dealerId = req.query.dealer_id ? String(req.query.dealer_id) : undefined;
    const locationId = req.query.location_id ? String(req.query.location_id) : undefined;
    const data = await fleetService.getFleetOverview(dealerId, locationId);
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

/** GET /api/fleet/vehicles/:vehicleId/availability?location_id=&date= */
export async function vehicleAvailabilityController(req: Request, res: Response) {
  try {
    const { vehicleId } = req.params;
    const locationId = String(req.query.location_id || '');
    const date = String(req.query.date || new Date().toISOString().split('T')[0]);
    if (!locationId) {
      res.status(400).json({ data: null, error: { message: 'location_id is required' } });
      return;
    }
    const data = await fleetService.getVehicleAvailabilityAtLocation(vehicleId, locationId, date);
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

/** GET /api/fleet/transits — list transit history */
export async function listTransitsController(req: Request, res: Response) {
  try {
    const filters: any = {};
    if (req.query.vehicle_id) filters.vehicle_id = String(req.query.vehicle_id);
    if (req.query.status) filters.status = String(req.query.status);
    if (req.query.from_date) filters.from_date = String(req.query.from_date);
    if (req.query.to_date) filters.to_date = String(req.query.to_date);
    if (req.query.to_location_id) filters.to_location_id = String(req.query.to_location_id);
    if (req.query.receiver_profile_id) filters.receiver_profile_id = String(req.query.receiver_profile_id);
    const data = await fleetService.listTransits(filters);
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

/** POST /api/fleet/transits — manually dispatch a vehicle */
export async function createTransitController(req: Request, res: Response) {
  try {
    const { vehicle_id, from_location_id, to_location_id, depart_time, notes, scheduled_by_profile_id } = req.body || {};
    if (!vehicle_id || !from_location_id || !to_location_id) {
      res.status(400).json({ data: null, error: { message: 'vehicle_id, from_location_id, to_location_id are required' } });
      return;
    }
    const data = await fleetService.scheduleTransit({
      vehicleId: vehicle_id,
      fromLocationId: from_location_id,
      toLocationId: to_location_id,
      departTime: depart_time ? new Date(depart_time) : new Date(),
      trigger: 'manual',
      notes: notes ?? null,
      scheduledByProfileId: scheduled_by_profile_id ?? null,
    });
    res.status(201).json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

/** PATCH /api/fleet/transits/:id/dispatch — mark transit as in_transit */
export async function dispatchTransitController(req: Request, res: Response) {
  try {
    const data = await fleetService.dispatchTransit(req.params.id);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Transit not found or already dispatched' } });
      return;
    }
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

/** PATCH /api/fleet/transits/:id/arrive — mark arrived (admin) */
export async function arriveTransitController(req: Request, res: Response) {
  try {
    const data = await fleetService.markTransitArrived(req.params.id);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Transit not found or already completed' } });
      return;
    }
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

/** PATCH /api/fleet/transits/:id/cancel */
export async function cancelTransitController(req: Request, res: Response) {
  try {
    const reason = req.body?.reason ? String(req.body.reason) : undefined;
    const data = await fleetService.cancelTransit(req.params.id, reason);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Transit not found or cannot be cancelled' } });
      return;
    }
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

// ── Receiver endpoints ────────────────────────────────────────────────────────

/** GET /api/fleet/locations/:locationId/security — list security staff at a location */
export async function locationSecurityController(req: Request, res: Response) {
  try {
    const data = await fleetService.getSecurityAtLocation(req.params.locationId);
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

/** PATCH /api/fleet/transits/:id/assign-receiver — manually assign security receiver */
export async function assignReceiverController(req: Request, res: Response) {
  try {
    const profileId = String(req.body?.profile_id || '');
    if (!profileId) {
      res.status(400).json({ data: null, error: { message: 'profile_id is required' } });
      return;
    }
    const data = await fleetService.assignReceiver(req.params.id, profileId);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Transit not found or cannot be updated' } });
      return;
    }
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

/**
 * PATCH /api/fleet/transits/:id/receive
 * Called by the security person to mark vehicle as received.
 * Requires authenticated user's profile to be security at destination.
 */
export async function receiveVehicleController(req: Request, res: Response) {
  try {
    const { profile_id, notes } = req.body || {};
    if (!profile_id) {
      res.status(400).json({ data: null, error: { message: 'profile_id is required' } });
      return;
    }
    const data = await fleetService.markVehicleReceived(req.params.id, String(profile_id), notes);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Transit not found' } });
      return;
    }
    res.json({ data, error: null });
  } catch (err: any) {
    const code = err.message?.startsWith('Forbidden') ? 403 : 400;
    res.status(code).json({ data: null, error: { message: err.message } });
  }
}

/** GET /api/fleet/locations/:locationId/incoming — transits arriving at this location */
export async function incomingTransitsController(req: Request, res: Response) {
  try {
    const data = await fleetService.getIncomingTransitsForLocation(req.params.locationId);
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

// ── Transit Requests ──────────────────────────────────────────────────────────

/**
 * POST /api/fleet/transit-requests
 * Sales manager creates a request for a vehicle from another branch.
 * Body: { vehicle_id, from_location_id, to_location_id, requested_by_profile_id, needed_for_date?, notes?, dealer_id? }
 */
export async function createTransitRequestController(req: Request, res: Response) {
  try {
    const { vehicle_id, from_location_id, to_location_id, requested_by_profile_id, needed_for_date, notes, dealer_id } = req.body || {};
    if (!vehicle_id || !from_location_id || !to_location_id || !requested_by_profile_id) {
      res.status(400).json({ data: null, error: { message: 'vehicle_id, from_location_id, to_location_id, requested_by_profile_id are required' } });
      return;
    }
    const data = await fleetService.createTransitRequest({
      vehicleId: vehicle_id,
      fromLocationId: from_location_id,
      toLocationId: to_location_id,
      requestedByProfileId: requested_by_profile_id,
      neededForDate: needed_for_date ?? null,
      notes: notes ?? null,
      dealerId: dealer_id ?? null,
    });
    res.status(201).json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

/**
 * GET /api/fleet/transit-requests
 * Query params: from_location_id, to_location_id, requested_by_profile_id, status, dealer_id
 */
export async function listTransitRequestsController(req: Request, res: Response) {
  try {
    const filters: Record<string, string | undefined> = {};
    if (req.query.from_location_id) filters.from_location_id = String(req.query.from_location_id);
    if (req.query.to_location_id) filters.to_location_id = String(req.query.to_location_id);
    if (req.query.requested_by_profile_id) filters.requested_by_profile_id = String(req.query.requested_by_profile_id);
    if (req.query.status) filters.status = String(req.query.status);
    if (req.query.dealer_id) filters.dealer_id = String(req.query.dealer_id);
    const data = await fleetService.listTransitRequests(filters);
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message } });
  }
}

/**
 * PATCH /api/fleet/transit-requests/:id/approve
 * Body: { manager_profile_id, notes? }
 */
export async function approveTransitRequestController(req: Request, res: Response) {
  try {
    const { manager_profile_id, notes } = req.body || {};
    if (!manager_profile_id) {
      res.status(400).json({ data: null, error: { message: 'manager_profile_id is required' } });
      return;
    }
    const data = await fleetService.approveTransitRequest(req.params.id, String(manager_profile_id), notes);
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Request not found or already actioned' } });
      return;
    }
    res.json({ data, error: null });
  } catch (err: any) {
    const code = err.message?.includes('not found') ? 404 : 500;
    res.status(code).json({ data: null, error: { message: err.message } });
  }
}

/**
 * PATCH /api/fleet/transit-requests/:id/reject
 * Body: { manager_profile_id, notes } (notes = rejection reason — required)
 */
export async function rejectTransitRequestController(req: Request, res: Response) {
  try {
    const { manager_profile_id, notes } = req.body || {};
    if (!manager_profile_id || !notes) {
      res.status(400).json({ data: null, error: { message: 'manager_profile_id and notes (rejection reason) are required' } });
      return;
    }
    const data = await fleetService.rejectTransitRequest(req.params.id, String(manager_profile_id), String(notes));
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Request not found or already actioned' } });
      return;
    }
    res.json({ data, error: null });
  } catch (err: any) {
    const code = err.message?.includes('not found') ? 404 : 500;
    res.status(code).json({ data: null, error: { message: err.message } });
  }
}

/**
 * PATCH /api/fleet/transit-requests/:id/cancel
 * Body: { requester_profile_id }
 */
export async function cancelTransitRequestController(req: Request, res: Response) {
  try {
    const { requester_profile_id } = req.body || {};
    if (!requester_profile_id) {
      res.status(400).json({ data: null, error: { message: 'requester_profile_id is required' } });
      return;
    }
    const data = await fleetService.cancelTransitRequest(req.params.id, String(requester_profile_id));
    if (!data) {
      res.status(404).json({ data: null, error: { message: 'Request not found or cannot be cancelled' } });
      return;
    }
    res.json({ data, error: null });
  } catch (err: any) {
    const code = err.message?.includes('not found') ? 404 : 500;
    res.status(code).json({ data: null, error: { message: err.message } });
  }
}
