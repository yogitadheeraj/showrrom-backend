import { randomUUID } from 'node:crypto';
import { createDealer } from './dealerService.js';
import { deleteDealer } from './dealerService.js';
import { createBrand } from './brandService.js';
import { deleteBrand } from './brandService.js';
import { createLocation } from './locationService.js';
import { deleteLocation } from './locationService.js';
import { deleteProfileByUserId, getProfileByUserId, upsertProfile } from './profileService.js';
import { deleteUserRole, getRoleByUserId, upsertUserRole } from './userRoleService.js';
import { BusinessUnit } from '../models/BusinessUnit.js';
import { SalesOffice } from '../models/SalesOffice.js';
import { Plant } from '../models/Plant.js';
import { BusinessUnitBrand } from '../models/BusinessUnitBrand.js';

type LocationInput = {
  name?: string;
  locationCode?: string;
  externalLocationId?: string | null;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  salesOfficeName?: string;
  salesOfficeCode?: string;
  externalSalesOfficeId?: string | null;
  plantName?: string;
  plantCode?: string;
  externalPlantId?: string | null;
};

type BrandInput = string | { name?: string; code?: string };

type BusinessUnitInput = {
  name?: string;
  code?: string;
};

function readArg<T>(args: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const key of keys) {
    if (key in args && args[key] !== undefined) {
      return args[key] as T;
    }
  }
  return undefined;
}

function requiredString(args: Record<string, unknown>, keys: string[], fieldName: string): string {
  const value = readArg<unknown>(args, ...keys);
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

export async function runRpc(name: string, args: Record<string, unknown>) {
  if (name !== 'onboard_dealer') {
    return { ok: true, rpc: name, args };
  }

  const dealerId = randomUUID();
  const userId = requiredString(args, ['_admin_user_id', 'admin_user_id', '_user_id', 'user_id'], 'admin_user_id');
  const dealerName = requiredString(args, ['_dealer_name', 'dealer_name'], 'dealer_name');
  const dealerCode = requiredString(args, ['_dealer_code', 'dealer_code'], 'dealer_code');
  const contactEmail = requiredString(args, ['_contact_email', 'contact_email'], 'contact_email');
  const slug = requiredString(args, ['_slug', 'slug'], 'slug');
  const fullName = requiredString(args, ['_full_name', 'full_name'], 'full_name');
  const email = requiredString(args, ['_email', 'email'], 'email');
  const contactPhone = readArg<string>(args, '_contact_phone', 'contact_phone');

  const businessUnitRaw = readArg<BusinessUnitInput>(args, '_business_unit', 'business_unit') || {};
  const businessUnitName = String(businessUnitRaw.name || '').trim();
  const businessUnitCode = String(businessUnitRaw.code || '').trim();
  if (!businessUnitName || !businessUnitCode) {
    throw new Error('business_unit.name and business_unit.code are required');
  }

  const brandList = (readArg<BrandInput[]>(args, '_brands', 'brands') || [])
    .map((brand) => {
      if (typeof brand === 'string') {
        const name = brand.trim();
        return { name, code: name.replace(/\s+/g, '_').toUpperCase() };
      }
      const name = String(brand?.name || '').trim();
      const code = String(brand?.code || '').trim();
      return { name, code };
    })
    .filter((b) => b.name && b.code);

  if (!brandList.length) {
    throw new Error('At least one brand is required');
  }

  const rawLocations = readArg<LocationInput[]>(args, '_locations', 'locations') || [];
  if (!rawLocations.length) {
    throw new Error('At least one location is required');
  }

  const locationList = rawLocations.map((location, index) => {
    const locationName = typeof location.name === 'string' ? location.name.trim() : '';
    const city = typeof location.city === 'string' ? location.city.trim() : '';
    const address = typeof location.address === 'string' ? location.address.trim() : '';
    const locationCode = typeof location.locationCode === 'string' ? location.locationCode.trim() : '';
    const salesOfficeCode = typeof location.salesOfficeCode === 'string' ? location.salesOfficeCode.trim() : '';
    const plantCode = typeof location.plantCode === 'string' ? location.plantCode.trim() : '';

    if (!locationName) throw new Error(`locations[${index}].name is required`);
    if (!city) throw new Error(`locations[${index}].city is required`);
    if (!address) throw new Error(`locations[${index}].address is required`);
    if (!locationCode) throw new Error(`locations[${index}].locationCode is required`);
    if (!salesOfficeCode) throw new Error(`locations[${index}].salesOfficeCode is required`);
    if (!plantCode) throw new Error(`locations[${index}].plantCode is required`);

    return {
      name: locationName,
      locationCode,
      externalLocationId:
        typeof location.externalLocationId === 'string' && location.externalLocationId.trim()
          ? location.externalLocationId.trim()
          : null,
      city,
      address,
      state: typeof location.state === 'string' && location.state.trim() ? location.state.trim() : null,
      phone: typeof location.phone === 'string' && location.phone.trim() ? location.phone.trim() : null,
      email: typeof location.email === 'string' && location.email.trim() ? location.email.trim() : null,
      salesOfficeName:
        typeof location.salesOfficeName === 'string' && location.salesOfficeName.trim()
          ? location.salesOfficeName.trim()
          : null,
      salesOfficeCode,
      externalSalesOfficeId:
        typeof location.externalSalesOfficeId === 'string' && location.externalSalesOfficeId.trim()
          ? location.externalSalesOfficeId.trim()
          : null,
      plantName:
        typeof location.plantName === 'string' && location.plantName.trim()
          ? location.plantName.trim()
          : null,
      plantCode,
      externalPlantId:
        typeof location.externalPlantId === 'string' && location.externalPlantId.trim()
          ? location.externalPlantId.trim()
          : null,
    };
  });

  const existingProfile = await getProfileByUserId(userId);
  const existingRole = await getRoleByUserId(userId);
  const createdBrandIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdBusinessUnitIds: string[] = [];
  const createdSalesOfficeIds: string[] = [];
  const createdPlantIds: string[] = [];
  const createdBusinessUnitBrandIds: string[] = [];
  let dealerCreated = false;

  try {
    await createDealer({
      id: dealerId,
      code: dealerCode,
      name: dealerName,
      slug,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      admin_user_id: userId,
      is_active: true,
    });
    dealerCreated = true;

    const businessUnitId = randomUUID();
    await BusinessUnit.create({
      id: businessUnitId,
      orgId: dealerId,
      code: businessUnitCode,
      name: businessUnitName,
      isActive: true,
    });
    createdBusinessUnitIds.push(businessUnitId);

    for (const brandEntry of brandList) {
      const createdBrand = await createBrand({
        dealer_id: dealerId,
        orgId: dealerId,
        code: brandEntry.code,
        name: brandEntry.name,
        description: null,
        logo_url: null,
        meta_title: null,
        meta_description: null,
        is_active: true,
      });
      createdBrandIds.push(String(createdBrand.id));

      const businessUnitBrandId = randomUUID();
      await BusinessUnitBrand.create({
        id: businessUnitBrandId,
        businessUnitId,
        brandId: String(createdBrand.id),
        isActive: true,
      });
      createdBusinessUnitBrandIds.push(businessUnitBrandId);
    }

    const salesOfficeByCode = new Map<string, string>();
    const plantByCompositeKey = new Map<string, string>();

    for (const location of locationList) {
      let salesOfficeId = salesOfficeByCode.get(location.salesOfficeCode);
      if (!salesOfficeId) {
        const existingSalesOffice = await SalesOffice.findOne({ salesOfficeCode: location.salesOfficeCode }).lean();
        if (existingSalesOffice?.id) {
          salesOfficeId = String(existingSalesOffice.id);
        } else {
          salesOfficeId = randomUUID();
          await SalesOffice.create({
            id: salesOfficeId,
            orgId: dealerId,
            businessUnitId,
            salesOfficeCode: location.salesOfficeCode,
            externalSalesOfficeId: location.externalSalesOfficeId,
            name: location.salesOfficeName || location.salesOfficeCode,
            isActive: true,
          });
          createdSalesOfficeIds.push(salesOfficeId);
        }
        salesOfficeByCode.set(location.salesOfficeCode, salesOfficeId);
      }

      const plantKey = `${salesOfficeId}:${location.plantCode}`;
      let plantId = plantByCompositeKey.get(plantKey);
      if (!plantId) {
        const existingPlant = await Plant.findOne({ salesOfficeId, plantCode: location.plantCode }).lean();
        if (existingPlant?.id) {
          plantId = String(existingPlant.id);
        } else {
          plantId = randomUUID();
          await Plant.create({
            id: plantId,
            orgId: dealerId,
            businessUnitId,
            salesOfficeId,
            plantCode: location.plantCode,
            externalPlantId: location.externalPlantId,
            name: location.plantName || location.plantCode,
            isActive: true,
          });
          createdPlantIds.push(plantId);
        }
        plantByCompositeKey.set(plantKey, plantId);
      }

      const created = await createLocation({
        dealer_id: dealerId,
        orgId: dealerId,
        businessUnitId,
        salesOfficeId,
        plantId,
        locationCode: location.locationCode,
        externalLocationId: location.externalLocationId,
        name: location.name,
        address: location.address,
        city: location.city,
        state: location.state,
        phone: location.phone,
        email: location.email,
        is_active: true,
      });
      createdLocationIds.push(String(created.id));
    }

    const primaryLocationId = createdLocationIds[0] || null;
    await upsertProfile({
      user_id: userId,
      full_name: fullName,
      email,
      location_id: primaryLocationId,
      is_active: true,
    });

    await upsertUserRole(userId, 'dealer_admin');

    return {
      ok: true,
      dealer_id: dealerId,
      organization_id: dealerId,
      business_unit_id: businessUnitId,
      location_id: primaryLocationId,
      location_ids: createdLocationIds,
      brands_created: brandList.length,
    };
  } catch (error) {
    if (existingRole) {
      await upsertUserRole(userId, existingRole.role);
    } else {
      await deleteUserRole(userId);
    }

    if (existingProfile) {
      await upsertProfile(existingProfile as unknown as Record<string, unknown>);
    } else {
      await deleteProfileByUserId(userId);
    }

    for (const locationId of createdLocationIds.reverse()) {
      await deleteLocation(locationId);
    }

    for (const businessUnitBrandId of createdBusinessUnitBrandIds.reverse()) {
      await BusinessUnitBrand.deleteOne({ id: businessUnitBrandId });
    }

    for (const plantId of createdPlantIds.reverse()) {
      await Plant.deleteOne({ id: plantId });
    }

    for (const salesOfficeId of createdSalesOfficeIds.reverse()) {
      await SalesOffice.deleteOne({ id: salesOfficeId });
    }

    for (const brandId of createdBrandIds.reverse()) {
      await deleteBrand(brandId);
    }

    for (const businessUnitId of createdBusinessUnitIds.reverse()) {
      await BusinessUnit.deleteOne({ id: businessUnitId });
    }

    if (dealerCreated) {
      await deleteDealer(dealerId);
    }

    throw error;
  }
}
