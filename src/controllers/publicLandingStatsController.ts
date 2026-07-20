import { Request, Response } from 'express';
import { Brand } from '../models/Brand.js';
import { Customer } from '../models/Customer.js';
import { TestDrive } from '../models/TestDrive.js';
import { Vehicle } from '../models/Vehicle.js';

export async function publicLandingStatsController(req: Request, res: Response) {
  try {
    const [availableVehicles, scheduledDrives, completedDrives, totalBrands, totalLeads] = await Promise.all([
      Vehicle.countDocuments({ is_active: true }),
      TestDrive.countDocuments({ status: 'scheduled' }),
      TestDrive.countDocuments({ status: 'completed' }),
      Brand.countDocuments({}),
      Customer.countDocuments({}),
    ]);

    res.status(200).json({
      data: {
        availableVehicles,
        testDrivesScheduled: scheduledDrives,
        testDrivesCompleted: completedDrives,
        totalBrands,
        salesToday: 0,
        totalLeads,
      },
      error: null,
    });
  } catch (error) {
    res.status(500).json({ data: null, error: { message: (error as Error).message } });
  }
}
