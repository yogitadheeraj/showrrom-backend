import express from 'express';
import multer from 'multer';
import { dbQueryController } from '../controllers/dbController.js';
import { invokeFunctionController } from '../controllers/functionsController.js';
import { rpcController } from '../controllers/rpcController.js';
import {
  listBrandsWithLocationsController,
  updateBrandBusinessUnitController,
  listBrandLocationsController,
  linkBrandLocationController,
  unlinkBrandLocationController,
} from '../controllers/brandLocationController.js';
import {
  listBusinessUnitsController,
  getBusinessUnitController,
  createBusinessUnitController,
  updateBusinessUnitController,
  deleteBusinessUnitController,
  listSalesOfficesController,
  getSalesOfficeController,
  createSalesOfficeController,
  updateSalesOfficeController,
  deleteSalesOfficeController,
  listPlantsController,
  getPlantController,
  createPlantController,
  updatePlantController,
  deletePlantController,
} from '../controllers/hierarchyController.js';
import {
  listController,
  publicUrlController,
  removeController,
  signedUrlController,
  uploadController,
} from '../controllers/storageController.js';
import { meController, resendVerificationController } from '../controllers/authController.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';
import {
  createLocationController,
  deleteLocationController,
  getLocationController,
  getLocationsController,
  updateLocationController,
} from '../controllers/locationController.js';
import {
  createBrandController,
  deleteBrandController,
  getBrandController,
  getBrandsController,
  updateBrandController,
} from '../controllers/brandController.js';
import {
  createLocationSpecialPeriodController,
  deleteLocationSpecialPeriodController,
  getLocationSpecialPeriodController,
  listLocationSpecialPeriodsController,
  updateLocationSpecialPeriodController,
} from '../controllers/locationSpecialPeriodController.js';
import {
  bulkUpsertLocationOperatingHoursController,
  createLocationOperatingHourController,
  deleteLocationOperatingHourController,
  getLocationOperatingHourController,
  listLocationOperatingHoursController,
  updateLocationOperatingHourController,
} from '../controllers/locationOperatingHourController.js';
import {
  bulkReassignController,
  createTestDriveController,
  deleteTestDriveController,
  getTestDriveController,
  getTestDrivesController,
  updateTestDriveController,
} from '../controllers/testDriveController.js';
import { publicBookTestDriveController } from '../controllers/publicBookingController.js';
import { publicLandingStatsController } from '../controllers/publicLandingStatsController.js';
import { submitTestDriveFeedbackController } from '../controllers/feedbackController.js';
import { previewEmailTemplateController } from '../controllers/emailTemplateController.js';
import {
  listIntegrationsController,
  listAllIntegrationsController,
  upsertIntegrationController,
  deleteIntegrationController,
  testIntegrationController,
} from '../controllers/integrationController.js';
import {
  startGoogleOAuth,
  googleOAuthCallback,
  startOutlookOAuth,
  outlookOAuthCallback,
} from '../controllers/oauthController.js';
import {
  createDealerController,
  deleteDealerController,
  getDealerController,
  getDealerBrandingController,
  listDealersController,
  updateDealerController,
} from '../controllers/dealerController.js';
import {
  getMyProfileController,
  getProfileController,
  listProfilesController,
  updateProfileController,
  upsertProfileController,
  clearExpiredLeavesController,
} from '../controllers/profileController.js';
import {
  deleteRoleController,
  getRoleController,
  listRolesController,
  upsertRoleController,
} from '../controllers/userRoleController.js';
import {
  createCustomerController,
  getCustomerController,
  listCustomersController,
  updateCustomerController,
} from '../controllers/customerController.js';
import {
  createVehicleController,
  deleteVehicleController,
  getVehicleController,
  listVehiclesController,
  updateVehicleController,
  availableVehiclesController,
} from '../controllers/vehicleController.js';
import {
  endSessionController,
  listEventsController,
  listOnlineSessionsController,
  logEventController,
  startSessionController,
  touchSessionController,
} from '../controllers/activityController.js';
import {
  createCommunicationController,
  listCommunicationsController,
  updateCommunicationController,
  updateCommunicationStatusController,
} from '../controllers/communicationController.js';
import {
  listNotificationsController,
  markAllReadController,
  markReadController,
  unreadCountController,
} from '../controllers/notificationController.js';
import {
  deleteFollowUpReminderConfigController,
  getFollowUpReminderConfigController,
  listFollowUpReminderConfigsController,
  upsertFollowUpReminderConfigController,
} from '../controllers/followUpReminderConfigController.js';
import {
  cancelConflictingBookingsController,
  createBlockedSlotController,
  deleteBlockedSlotController,
  getBlockedSlotController,
  listBlockedSlotsController,
} from '../controllers/locationBlockedSlotController.js';
import {
  createUserController,
  deleteUserController,
  disableUserController,
  enableUserController,
  getUserController,
  sendTestDriveNotificationController,
  setCustomClaimsController,
  updateUserController,
} from '../controllers/firebaseController.js';
import {
  createCarBookingController,
  getCarBookingController,
  listCarBookingsController,
  updateCarBookingController,
} from '../controllers/carBookingController.js';
import {
  cancelCustomerBookingController,
  getCustomerBookingController,
  rebookCustomerController,
  rescheduleCustomerBookingController,
  uploadCustomerDocumentController,
} from '../controllers/customerBookingController.js';
import {
  fleetOverviewController,
  vehicleAvailabilityController,
  listTransitsController,
  createTransitController,
  dispatchTransitController,
  arriveTransitController,
  cancelTransitController,
  locationSecurityController,
  assignReceiverController,
  receiveVehicleController,
  incomingTransitsController,
  createTransitRequestController,
  listTransitRequestsController,
  approveTransitRequestController,
  rejectTransitRequestController,
  cancelTransitRequestController,
} from '../controllers/vehicleFleetController.js';

const upload = multer({ storage: multer.memoryStorage() });

export const apiRouter = express.Router();

// Generic DB query (fallback for all other collections)
apiRouter.post('/db/query', dbQueryController);
apiRouter.post('/functions/:name', invokeFunctionController);
apiRouter.post('/rpc/:name', rpcController);

// ── Shared Vehicle Fleet ──────────────────────────────────────────────────────
apiRouter.get('/fleet/overview', requireAuth, fleetOverviewController);
apiRouter.get('/fleet/vehicles/:vehicleId/availability', requireAuth, vehicleAvailabilityController);
apiRouter.get('/fleet/transits', requireAuth, listTransitsController);
apiRouter.post('/fleet/transits', requireAuth, createTransitController);
apiRouter.patch('/fleet/transits/:id/dispatch', requireAuth, dispatchTransitController);
apiRouter.patch('/fleet/transits/:id/arrive', requireAuth, arriveTransitController);
apiRouter.patch('/fleet/transits/:id/cancel', requireAuth, cancelTransitController);
apiRouter.patch('/fleet/transits/:id/assign-receiver', requireAuth, assignReceiverController);
apiRouter.patch('/fleet/transits/:id/receive', requireAuth, receiveVehicleController);
apiRouter.get('/fleet/locations/:locationId/security', requireAuth, locationSecurityController);
apiRouter.get('/fleet/locations/:locationId/incoming', requireAuth, incomingTransitsController);

// ── Transit Requests ─────────────────────────────────────────────────────────
apiRouter.get('/fleet/transit-requests', requireAuth, listTransitRequestsController);
apiRouter.post('/fleet/transit-requests', requireAuth, createTransitRequestController);
apiRouter.patch('/fleet/transit-requests/:id/approve', requireAuth, approveTransitRequestController);
apiRouter.patch('/fleet/transit-requests/:id/reject', requireAuth, rejectTransitRequestController);
apiRouter.patch('/fleet/transit-requests/:id/cancel', requireAuth, cancelTransitRequestController);

// Storage
apiRouter.post('/storage/:bucket/upload', upload.single('file'), uploadController);
apiRouter.get('/storage/:bucket/list', listController);
apiRouter.post('/storage/:bucket/public-url', publicUrlController);
apiRouter.post('/storage/:bucket/signed-url', signedUrlController);
apiRouter.post('/storage/:bucket/remove', removeController);

// Public landing stats (guest-safe)
apiRouter.get('/public/landing-stats', publicLandingStatsController);

// Auth
apiRouter.get('/auth/me', requireAuth, meController);
apiRouter.post('/auth/resend-verification', resendVerificationController);

// Locations
apiRouter.get('/locations', getLocationsController);
apiRouter.get('/locations/:id', getLocationController);
apiRouter.post('/locations', requireAuth, createLocationController);
apiRouter.patch('/locations/:id', requireAuth, updateLocationController);
apiRouter.delete('/locations/:id', requireAuth, deleteLocationController);

// Brands
apiRouter.get('/brands', getBrandsController);
apiRouter.get('/brands/:id', getBrandController);
apiRouter.post('/brands', requireAuth, createBrandController);
apiRouter.patch('/brands/:id', requireAuth, updateBrandController);
apiRouter.delete('/brands/:id', requireAuth, deleteBrandController);

// Location Special Periods
apiRouter.get('/location-special-periods', listLocationSpecialPeriodsController);
apiRouter.get('/location-special-periods/:id', getLocationSpecialPeriodController);
apiRouter.post('/location-special-periods', requireAuth, createLocationSpecialPeriodController);
apiRouter.patch('/location-special-periods/:id', requireAuth, updateLocationSpecialPeriodController);
apiRouter.delete('/location-special-periods/:id', requireAuth, deleteLocationSpecialPeriodController);

// Location Operating Hours
apiRouter.get('/location-operating-hours', listLocationOperatingHoursController);
apiRouter.get('/location-operating-hours/:id', getLocationOperatingHourController);
apiRouter.post('/location-operating-hours', requireAuth, createLocationOperatingHourController);
apiRouter.patch('/location-operating-hours/:id', requireAuth, updateLocationOperatingHourController);
apiRouter.delete('/location-operating-hours/:id', requireAuth, deleteLocationOperatingHourController);
apiRouter.post('/location-operating-hours/bulk-upsert', requireAuth, bulkUpsertLocationOperatingHoursController);

// Public booking (no auth required — rate-limited by phone + location)
apiRouter.post('/public/book', publicBookTestDriveController);
// Public feedback submission (no auth required)
apiRouter.post('/public/feedback', submitTestDriveFeedbackController);
// Email template preview (auth required — dealer_admin / superadmin)
apiRouter.get('/email-templates/preview', requireAuth, previewEmailTemplateController);

// Customer self-service booking (token-verified, no auth required)
apiRouter.get('/customer/booking/:testDriveId', getCustomerBookingController);
apiRouter.post('/customer/booking/:testDriveId/cancel', cancelCustomerBookingController);
apiRouter.post('/customer/booking/:testDriveId/reschedule', rescheduleCustomerBookingController);
apiRouter.post('/customer/booking/:testDriveId/documents', upload.single('file'), uploadCustomerDocumentController);
apiRouter.post('/customer/booking/:testDriveId/rebook', rebookCustomerController);

// Test Drives
apiRouter.post('/test-drives/bulk-reassign', requireAuth, bulkReassignController);
apiRouter.get('/test-drives', requireAuth, getTestDrivesController);
apiRouter.get('/test-drives/:id', requireAuth, getTestDriveController);
apiRouter.post('/test-drives', requireAuth, createTestDriveController);
apiRouter.patch('/test-drives/:id', requireAuth, updateTestDriveController);
apiRouter.delete('/test-drives/:id', requireAuth, deleteTestDriveController);

// Integrations
apiRouter.get('/admin/integrations', requireAuth, requireSuperAdmin, listAllIntegrationsController);
apiRouter.get('/integrations', requireAuth, listIntegrationsController);
apiRouter.put('/integrations/:type', requireAuth, upsertIntegrationController);
apiRouter.delete('/integrations/:type', requireAuth, deleteIntegrationController);
apiRouter.post('/integrations/:type/test', requireAuth, testIntegrationController);

// OAuth — calendar integrations (start requires auth; callback is open — state is HMAC-verified)
apiRouter.get('/integrations/oauth/google/start', startGoogleOAuth);
apiRouter.get('/integrations/oauth/google/callback', googleOAuthCallback);
apiRouter.get('/integrations/oauth/outlook/start', requireAuth, startOutlookOAuth);
apiRouter.get('/integrations/oauth/outlook/callback', outlookOAuthCallback);

// Car Bookings
apiRouter.get('/car-bookings', requireAuth, listCarBookingsController);
apiRouter.get('/car-bookings/:id', requireAuth, getCarBookingController);
apiRouter.post('/car-bookings', requireAuth, createCarBookingController);
apiRouter.patch('/car-bookings/:id', requireAuth, updateCarBookingController);

// Dealers
apiRouter.get('/dealers/branding/:slug', getDealerBrandingController); // public — no auth
apiRouter.get('/dealers', listDealersController);
apiRouter.get('/dealers/:id', getDealerController);
apiRouter.post('/dealers', requireAuth, createDealerController);
apiRouter.patch('/dealers/:id', requireAuth, updateDealerController);
apiRouter.delete('/dealers/:id', requireAuth, deleteDealerController);

// Profiles
apiRouter.get('/profiles/me', requireAuth, getMyProfileController);
apiRouter.post('/profiles/clear-expired-leaves', requireAuth, clearExpiredLeavesController);
apiRouter.get('/profiles', requireAuth, listProfilesController);
apiRouter.get('/profiles/:id', requireAuth, getProfileController);
apiRouter.post('/profiles', requireAuth, upsertProfileController);
apiRouter.patch('/profiles/:id', requireAuth, updateProfileController);

// User Roles
apiRouter.get('/user-roles', requireAuth, listRolesController);
apiRouter.get('/user-roles/:userId', requireAuth, getRoleController);
apiRouter.post('/user-roles', requireAuth, upsertRoleController);
apiRouter.delete('/user-roles/:userId', requireAuth, deleteRoleController);

// Customers
apiRouter.get('/customers', requireAuth, listCustomersController);
apiRouter.get('/customers/:id', requireAuth, getCustomerController);
apiRouter.post('/customers', requireAuth, createCustomerController);
apiRouter.patch('/customers/:id', requireAuth, updateCustomerController);

// Vehicles
apiRouter.get('/vehicles/available', requireAuth, availableVehiclesController);
apiRouter.get('/vehicles', requireAuth, listVehiclesController);
apiRouter.get('/vehicles/:id', requireAuth, getVehicleController);
apiRouter.post('/vehicles', requireAuth, createVehicleController);
apiRouter.patch('/vehicles/:id', requireAuth, updateVehicleController);
apiRouter.delete('/vehicles/:id', requireAuth, deleteVehicleController);

// Activity Events
apiRouter.get('/activity/events', requireAuth, listEventsController);
apiRouter.post('/activity/events', requireAuth, logEventController);

// Activity Sessions
apiRouter.get('/activity/sessions/online', requireAuth, listOnlineSessionsController);
apiRouter.post('/activity/sessions', requireAuth, startSessionController);
apiRouter.patch('/activity/sessions/:id/touch', requireAuth, touchSessionController);
apiRouter.patch('/activity/sessions/:id/end', requireAuth, endSessionController);

// Communications
apiRouter.get('/communications', requireAuth, listCommunicationsController);
apiRouter.post('/communications', requireAuth, createCommunicationController);
apiRouter.patch('/communications/:id', requireAuth, updateCommunicationController);
apiRouter.patch('/communications/:id/status', requireAuth, updateCommunicationStatusController);

// Notifications
apiRouter.get('/notifications', requireAuth, listNotificationsController);
apiRouter.get('/notifications/unread-count', requireAuth, unreadCountController);
apiRouter.patch('/notifications/:id/read', requireAuth, markReadController);
apiRouter.post('/notifications/mark-all-read', requireAuth, markAllReadController);

// Location Blocked Slots
apiRouter.get('/location-blocked-slots', listBlockedSlotsController);
apiRouter.get('/location-blocked-slots/:id', getBlockedSlotController);
apiRouter.post('/location-blocked-slots', requireAuth, createBlockedSlotController);
apiRouter.delete('/location-blocked-slots/:id', requireAuth, deleteBlockedSlotController);
apiRouter.post('/location-blocked-slots/:id/cancel-conflicts', requireAuth, cancelConflictingBookingsController);

// Follow-up Reminder Config
apiRouter.get('/follow-up-reminder-config', requireAuth, listFollowUpReminderConfigsController);
apiRouter.get('/follow-up-reminder-config/:locationId', requireAuth, getFollowUpReminderConfigController);
apiRouter.put('/follow-up-reminder-config', requireAuth, upsertFollowUpReminderConfigController);
apiRouter.delete('/follow-up-reminder-config/:locationId', requireAuth, deleteFollowUpReminderConfigController);

// Firebase Admin – User Management
apiRouter.post('/firebase/users', requireAuth, createUserController);
apiRouter.get('/firebase/users/:uid', requireAuth, getUserController);
apiRouter.patch('/firebase/users/:uid', requireAuth, updateUserController);
apiRouter.patch('/firebase/users/:uid/disable', requireAuth, disableUserController);
apiRouter.patch('/firebase/users/:uid/enable', requireAuth, enableUserController);
apiRouter.delete('/firebase/users/:uid', requireAuth, deleteUserController);
apiRouter.post('/firebase/users/:uid/claims', requireAuth, setCustomClaimsController);

// Firebase – Test Drive Notifications
apiRouter.post('/firebase/notify/test-drive', requireAuth, sendTestDriveNotificationController);

// ── Hierarchy: Business Units ─────────────────────────────────────────────────
apiRouter.get('/business-units', requireAuth, listBusinessUnitsController);
apiRouter.get('/business-units/:id', requireAuth, getBusinessUnitController);
apiRouter.post('/business-units', requireAuth, createBusinessUnitController);
apiRouter.patch('/business-units/:id', requireAuth, updateBusinessUnitController);
apiRouter.delete('/business-units/:id', requireAuth, deleteBusinessUnitController);

// ── Hierarchy: Sales Offices ──────────────────────────────────────────────────
apiRouter.get('/sales-offices', requireAuth, listSalesOfficesController);
apiRouter.get('/sales-offices/:id', requireAuth, getSalesOfficeController);
apiRouter.post('/sales-offices', requireAuth, createSalesOfficeController);
apiRouter.patch('/sales-offices/:id', requireAuth, updateSalesOfficeController);
apiRouter.delete('/sales-offices/:id', requireAuth, deleteSalesOfficeController);

// ── Hierarchy: Plants ─────────────────────────────────────────────────────────
apiRouter.get('/plants', requireAuth, listPlantsController);
apiRouter.get('/plants/:id', requireAuth, getPlantController);
apiRouter.post('/plants', requireAuth, createPlantController);
apiRouter.patch('/plants/:id', requireAuth, updatePlantController);
apiRouter.delete('/plants/:id', requireAuth, deletePlantController);

// ── Brand ↔ Location management ───────────────────────────────────────────────
apiRouter.get('/brands-with-locations', requireAuth, listBrandsWithLocationsController);
apiRouter.patch('/brands/:id/business-unit', requireAuth, updateBrandBusinessUnitController);
apiRouter.get('/brand-locations', requireAuth, listBrandLocationsController);
apiRouter.post('/brand-locations', requireAuth, linkBrandLocationController);
apiRouter.delete('/brand-locations/:brandId/:locationId', requireAuth, unlinkBrandLocationController);

