/**
 * Simulated performance data for the Growth Engine demo.
 *
 * We deliberately do NOT run real ad campaigns or spend real money in this
 * demo (decided earlier — no ad account APIs, no ad spend). Instead, this
 * script generates realistic-looking impressions/clicks/conversions/spend
 * for each (AdHook + LandingPage) pair, clearly flagged isSimulated: true
 * in the schema so nobody mistakes it for real data later.
 *
 * The numbers aren't pure noise — each persuasion angle gets a different
 * performance bias (e.g. urgency/social-proof hooks convert a bit better),
 * so the dashboard shows a believable "winning hook" per product rather
 * than random results.
 *
 * Usage:
 *   npx tsx scripts/seed-metrics.ts
 */

import { prisma } from "../lib/prisma";

// Rough CTR/CVR bias per angle keyword found in the hook's variantLabel.
// Numbers are illustrative, not real benchmarks.
const ANGLE_BIAS: { match: string; ctrBoost: number; cvrBoost: number }[] = [
  { match: "urgency", ctrBoost: 0.012, cvrBoost: 0.01 },
  { match: "social proof", ctrBoost: 0.008, cvrBoost: 0.015 },
  { match: "benefit", ctrBoost: 0.005, cvrBoost: 0.02 },
  { match: "problem", ctrBoost: 0.003, cvrBoost: 0.012 },
  { match: "curiosity", ctrBoost: 0.015, cvrBoost: 0.005 },
];

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function biasFor(variantLabel: string) {
  const lower = variantLabel.toLowerCase();
  const found = ANGLE_BIAS.find((b) => lower.includes(b.match));
  return found ?? { ctrBoost: 0, cvrBoost: 0 };
}

async function main() {
  console.log("Loading landing pages to generate simulated metrics for...");

  const landingPages = await prisma.landingPage.findMany({
    include: { adHook: true },
  });

  if (landingPages.length === 0) {
    console.error("No landing pages found — run scripts/generate-landing-pages.ts first.");
    process.exit(1);
  }

  console.log(`Found ${landingPages.length} landing pages.\n`);

  // Clear old simulated metrics so re-running stays clean.
  await prisma.metric.deleteMany({ where: { isSimulated: true } });

  let created = 0;

  for (const page of landingPages) {
    const bias = biasFor(page.adHook.variantLabel);

    const impressions = Math.round(randomBetween(800, 3000));
    const baseCtr = randomBetween(0.015, 0.035) + bias.ctrBoost;
    const clicks = Math.round(impressions * baseCtr);
    const baseCvr = randomBetween(0.02, 0.05) + bias.cvrBoost;
    const conversions = Math.round(clicks * baseCvr);
    const cpc = randomBetween(0.4, 1.2);
    const spend = Math.round(clicks * cpc * 100) / 100;

    await prisma.metric.create({
      data: {
        adHookId: page.adHookId,
        landingPageId: page.id,
        impressions,
        clicks,
        conversions,
        spend,
        isSimulated: true,
      },
    });

    console.log(
      `  [${page.adHook.variantLabel}] ${impressions} impr / ${clicks} clicks / ${conversions} conv / $${spend.toFixed(2)} spend`
    );
    created++;
  }

  console.log(`\nDone. ${created} simulated metric rows created.`);
  console.log(`Open the dashboard at http://localhost:3000/dashboard`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Metric seeding failed:", err);
  process.exit(1);
});
