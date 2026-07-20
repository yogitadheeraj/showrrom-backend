/**
 * Usage:
 *   npx tsx src/scripts/setDealerSlug.ts [--list] [--set <dealer_id_or_name> <slug>]
 *
 * Examples:
 *   npx tsx src/scripts/setDealerSlug.ts --list
 *   npx tsx src/scripts/setDealerSlug.ts --set "Auto Advant" autoadvant
 *   npx tsx src/scripts/setDealerSlug.ts --set <id> autoadvant
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Dealer } from '../models/Dealer.js';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('✅  Connected to MongoDB\n');

  const args = process.argv.slice(2);

  if (args[0] === '--list' || args.length === 0) {
    const dealers = await Dealer.find({}, { id: 1, name: 1, slug: 1, is_active: 1 }).lean();
    if (dealers.length === 0) {
      console.log('No dealers found.');
    } else {
      console.log('Dealers:');
      dealers.forEach((d: any) => {
        console.log(`  id=${d.id}  name="${d.name}"  slug=${d.slug ?? '(none)'}  active=${d.is_active}`);
      });
    }
    await mongoose.disconnect();
    return;
  }

  if (args[0] === '--set' && args[1] && args[2]) {
    const identifier = args[1];
    const slug = args[2].toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Try by id first, then by name
    let dealer = await Dealer.findOne({ id: identifier });
    if (!dealer) dealer = await Dealer.findOne({ name: { $regex: identifier, $options: 'i' } });

    if (!dealer) {
      console.error(`❌  Dealer not found: "${identifier}"`);
      await mongoose.disconnect();
      process.exit(1);
    }

    // Check slug not already taken
    const existing = await Dealer.findOne({ slug, id: { $ne: dealer.id } });
    if (existing) {
      console.error(`❌  Slug "${slug}" already taken by dealer: ${existing.name}`);
      await mongoose.disconnect();
      process.exit(1);
    }

    (dealer as any).slug = slug;
    await dealer.save();
    console.log(`✅  Set slug "${slug}" on dealer "${dealer.name}" (id=${dealer.id})`);
    console.log(`\nTest it:`);
    console.log(`  curl http://localhost:4000/api/dealers/branding/${slug}`);
    console.log(`  http://localhost:8080/?dealer=${slug}`);

    await mongoose.disconnect();
    return;
  }

  console.log('Usage: npx tsx src/scripts/setDealerSlug.ts [--list] [--set <id_or_name> <slug>]');
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
