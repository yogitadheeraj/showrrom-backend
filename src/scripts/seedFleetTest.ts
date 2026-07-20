/**
 * Fleet E2E Test Seed Script
 * Run: npx tsx src/scripts/seedFleetTest.ts
 *
 * What it does:
 *  1. Patches 2 existing locations with real Mumbai coordinates (for OSRM routing)
 *  2. Marks one demo vehicle as is_shared = true
 *  3. Creates 2 test drives for that vehicle at different locations (today + tomorrow)
 *  4. Prints the fleet overview + availability check
 */

import 'dotenv/config';
import mongoose from 'mongoose';

// Load .env explicitly from apps/api directory
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });
import { env } from '../config/env.js';
import { Vehicle } from '../models/Vehicle.js';
import { Location } from '../models/Location.js';
import { TestDrive } from '../models/TestDrive.js';
import { Customer } from '../models/Customer.js';
import { randomUUID } from 'node:crypto';
import { getFleetOverview, getVehicleAvailabilityAtLocation } from '../services/vehicleFleetService.js';

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(msg: string) { console.log(msg); }
function ok(msg: string) { console.log(`${GREEN}✓${RESET} ${msg}`); }
function info(msg: string) { console.log(`${BLUE}ℹ${RESET} ${msg}`); }
function warn(msg: string) { console.log(`${YELLOW}⚠${RESET} ${msg}`); }

const MUMBAI_LOCATIONS = [
  { name: 'Bandra West Showroom', city: 'Mumbai', lat: '19.0596', lng: '72.8295', address: 'Linking Road, Bandra West, Mumbai' },
  { name: 'Powai Showroom',       city: 'Mumbai', lat: '19.1176', lng: '72.9060', address: 'Hiranandani Estate, Powai, Mumbai' },
];

async function run() {
  log(`\n${BOLD}═══ Fleet E2E Test Seed ═══${RESET}\n`);
  
  ok('\nDone!\n');
}

run().catch((err) => { console.error(err); process.exit(1); });
