/**
 * Landing page generator for the Growth Engine demo.
 *
 * For every AdHook that doesn't already have a LandingPage, this creates
 * one — with a unique, readable slug derived from the hook's headline.
 * The actual page RENDERING happens live in Next.js at
 * app/lp/[slug]/page.tsx, which reads this row (+ its linked hook and
 * product) straight from the database. This script only creates the
 * database row and the slug that ties everything together — "message
 * match" (ad copy continuing onto the landing page) comes from both
 * reading the same AdHook.
 *
 * Usage:
 *   npx tsx scripts/generate-landing-pages.ts
 */

import { prisma } from "../lib/prisma";

/** Turn "Only Hours Left..." into a URL-safe slug like "only-hours-left-a1b2c3". */
function slugify(headline: string, uniqueSuffix: string): string {
  const base = headline
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${base}-${uniqueSuffix}`;
}

async function main() {
  console.log("Loading ad hooks without a landing page yet...");

  const brand = await prisma.brand.findFirst({ where: { name: "Gymshark" } });
  if (!brand) {
    console.error('No "Gymshark" brand found — run scripts/scrape.ts first.');
    process.exit(1);
  }

  const hooksNeedingPages = await prisma.adHook.findMany({
    where: { brandId: brand.id, landingPages: { none: {} } },
    include: { product: true },
  });

  if (hooksNeedingPages.length === 0) {
    console.log("Every ad hook already has a landing page. Nothing to do.");
    console.log('(Run "npx tsx scripts/generate-hooks.ts" first if AdHook is empty.)');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${hooksNeedingPages.length} hooks needing landing pages.\n`);

  let created = 0;

  for (const hook of hooksNeedingPages) {
    const slug = slugify(hook.headline, hook.id.slice(-6));

    await prisma.landingPage.create({
      data: {
        brandId: brand.id,
        adHookId: hook.id,
        slug,
        status: "PUBLISHED",
        templateId: "default",
      },
    });

    console.log(`  Created /lp/${slug}  (for "${hook.headline}" — ${hook.product.title})`);
    created++;
  }

  console.log(`\nDone. ${created} landing pages created.`);
  console.log(`Start your dev server (npm run dev) and visit e.g.:`);
  console.log(`  http://localhost:3000/lp/<slug-from-above>`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Landing page generation failed:", err);
  process.exit(1);
});
