/**
 * Ad hook / copy generator for the Growth Engine demo.
 *
 * Reads scraped Gymshark products (from scripts/scrape.ts) plus scraped
 * Alphalete competitor copy, sends both to DeepSeek, and asks for 3-5 ad
 * copy variants per product — each with a distinct angle (urgency, social
 * proof, benefit-led, etc.) so the "dashboard" step later has real
 * variants to compare against each other.
 *
 * Usage:
 *   npx tsx scripts/generate-hooks.ts
 *
 * Requires DEEPSEEK_API_KEY in your .env file.
 * DeepSeek's API is OpenAI-compatible, so this uses the "openai" package
 * pointed at DeepSeek's own endpoint instead of OpenAI's.
 */

import OpenAI from "openai";
import { prisma } from "../lib/prisma";

const MODEL = "deepseek-chat";
const PRODUCTS_TO_PROCESS = 6; // keep it small/cheap for a demo run
const VARIANTS_PER_PRODUCT = 4;

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

// ---------------------------------------------------------------------------
// Types for what we ask Claude to return
// ---------------------------------------------------------------------------

interface HookVariant {
  variantLabel: string; // e.g. "Hook A - urgency"
  headline: string;
  bodyText: string;
  cta: string;
}

function buildPrompt(product: {
  title: string;
  price: unknown;
  description: string | null;
  category: string | null;
}, competitorSamples: { headline: string | null; bodyText: string | null }[]): string {
  const competitorBlock = competitorSamples
    .map((c, i) => `${i + 1}. "${c.headline ?? "(no title)"}" — ${(c.bodyText ?? "").slice(0, 200)}`)
    .join("\n");

  return `You are a senior direct-response ad copywriter for a fitness apparel brand.

PRODUCT TO ADVERTISE:
- Name: ${product.title}
- Price: $${product.price}
- Category: ${product.category ?? "apparel"}
- Description: ${(product.description ?? "").slice(0, 600)}

COMPETITOR REFERENCE (a rival brand's similar products, for inspiration on angle/tone only — do not copy their wording):
${competitorBlock || "(none available)"}

TASK:
Write ${VARIANTS_PER_PRODUCT} distinct Meta/Instagram ad copy variants for the product above. Each variant must use a DIFFERENT persuasion angle — choose from: urgency/scarcity, social proof, benefit-led/transformation, problem-agitate-solve, curiosity hook. Do not reuse the same angle twice.

Return ONLY a JSON array (no markdown fences, no commentary) matching this exact shape:
[
  {
    "variantLabel": "Hook A - <angle name>",
    "headline": "<short, punchy headline, under 40 characters>",
    "bodyText": "<1-2 sentence ad body, under 150 characters>",
    "cta": "<short call to action, e.g. 'Shop Now'>"
  }
]`;
}

/** Ask DeepSeek for variants and parse the JSON it returns. */
async function generateHooksForProduct(
  product: { title: string; price: unknown; description: string | null; category: string | null },
  competitorSamples: { headline: string | null; bodyText: string | null }[]
): Promise<HookVariant[]> {
  const completion = await deepseek.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: buildPrompt(product, competitorSamples) }],
  });

  const raw = completion.choices[0]?.message?.content ?? "";

  // DeepSeek sometimes wraps JSON in ```json fences despite instructions — strip them defensively.
  const cleaned = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as HookVariant[];
    return parsed;
  } catch (err) {
    console.warn(`  ! Could not parse DeepSeek's response as JSON for "${product.title}". Raw response:\n${raw}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error("Missing DEEPSEEK_API_KEY in .env — add it before running this script.");
    process.exit(1);
  }

  console.log("Loading scraped products...");
  const brand = await prisma.brand.findFirst({ where: { name: "Gymshark" } });
  if (!brand) {
    console.error('No "Gymshark" brand found — run scripts/scrape.ts first.');
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { brandId: brand.id },
    take: PRODUCTS_TO_PROCESS,
    orderBy: { scrapedAt: "desc" },
  });

  if (products.length === 0) {
    console.error("No products found — run scripts/scrape.ts first.");
    process.exit(1);
  }

  const competitor = await prisma.competitor.findFirst({ where: { brandId: brand.id } });
  const competitorAds = competitor
    ? await prisma.competitorAd.findMany({
        where: { competitorId: competitor.id },
        take: 5,
        select: { headline: true, bodyText: true },
      })
    : [];

  console.log(`Found ${products.length} products and ${competitorAds.length} competitor references.\n`);

  let totalHooksCreated = 0;

  for (const product of products) {
    console.log(`Generating hooks for "${product.title}" ($${product.price})...`);

    // Clear old hooks for this product so re-running the script stays clean.
    // Must delete in dependency order: Metric -> LandingPage -> AdHook,
    // since Postgres blocks deleting a hook that a landing page still
    // references (foreign key RESTRICT).
    const oldHooks = await prisma.adHook.findMany({
      where: { productId: product.id },
      select: { id: true },
    });
    const oldHookIds = oldHooks.map((h: { id: string }) => h.id);

    if (oldHookIds.length > 0) {
      await prisma.metric.deleteMany({ where: { adHookId: { in: oldHookIds } } });
      await prisma.landingPage.deleteMany({ where: { adHookId: { in: oldHookIds } } });
      await prisma.adHook.deleteMany({ where: { id: { in: oldHookIds } } });
    }

    const variants = await generateHooksForProduct(product, competitorAds);

    if (variants.length === 0) {
      console.warn(`  ! No hooks generated for "${product.title}"`);
      continue;
    }

    await prisma.adHook.createMany({
      data: variants.map((v) => ({
        brandId: brand.id,
        productId: product.id,
        variantLabel: v.variantLabel,
        headline: v.headline,
        bodyText: v.bodyText,
        cta: v.cta,
        generatedFrom: {
          competitorSamplesUsed: competitorAds.length,
          model: MODEL,
        },
      })),
    });

    console.log(`  Saved ${variants.length} hooks:`);
    variants.forEach((v) => console.log(`    - [${v.variantLabel}] "${v.headline}"`));

    totalHooksCreated += variants.length;
  }

  console.log(`\nDone. ${totalHooksCreated} ad hooks created across ${products.length} products.`);
  console.log(`Open "npx prisma studio" to review them in the AdHook table.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Hook generation failed:", err);
  process.exit(1);
});
