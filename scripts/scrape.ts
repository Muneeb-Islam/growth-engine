/**
 * Playwright scraper for the Growth Engine demo.
 *
 * Both Gymshark and Alphalete run on Shopify and both expose a clean
 * `ProductGroup` JSON-LD block on every product page (confirmed by hand
 * before writing this). That means we don't need fragile CSS selectors —
 * we load the page, pull the JSON-LD script tag out of the DOM, and parse
 * structured data directly. This is far more reliable than scraping text
 * off the rendered page.
 *
 * Usage:
 *   npx tsx scripts/scrape.ts
 *
 * What it does:
 *   1. Seeds/ensures the Brand (Gymshark) and Competitor (Alphalete) rows.
 *   2. Visits each collection page, collects product URLs.
 *   3. Visits each product URL, extracts title/price/description/images.
 *   4. Clears old rows for that brand/competitor and inserts fresh ones —
 *      so re-running this script during the demo always gives clean data.
 */

import { chromium, type Browser, type Page } from "playwright";
import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// Config — edit these to point at different collections/brands
// ---------------------------------------------------------------------------

const TARGET_BRAND = {
  name: "Gymshark",
  domain: "gymshark.com",
  niche: "fitness apparel",
  collectionUrl: "https://www.gymshark.com/collections/leggings",
};

const COMPETITOR = {
  name: "Alphalete",
  domain: "alphaleteathletics.com",
  collectionUrl: "https://alphaleteathletics.com/collections/womens-leggings",
};

const PRODUCTS_PER_SITE = 6; // keep it small for a fast demo run

// ---------------------------------------------------------------------------
// Types for the JSON-LD shape both sites use
// ---------------------------------------------------------------------------

interface ShopifyOffer {
  price: number;
  priceCurrency: string;
}

interface ShopifyVariant {
  name: string;
  description?: string;
  offers?: ShopifyOffer;
}

interface ShopifyProductGroup {
  "@type": "ProductGroup";
  name: string;
  description?: string;
  image?: string[];
  category?: string;
  color?: string;
  url: string;
  hasVariant?: ShopifyVariant[];
}

interface ScrapedProduct {
  sourceUrl: string;
  title: string;
  price: number;
  currency: string;
  description: string;
  imageUrls: string[];
  category: string | null;
}

// ---------------------------------------------------------------------------
// Core scraping helpers
// ---------------------------------------------------------------------------

/** Pull every /products/ link off a Shopify collection page. */
async function collectProductUrls(page: Page, collectionUrl: string, limit: number): Promise<string[]> {
  await page.goto(collectionUrl, { waitUntil: "domcontentloaded" });
  // Shopify collection grids render client-side in places — give it a moment.
  await page.waitForTimeout(1500);

  const hrefs: string[] = await page.$$eval('a[href*="/products/"]', (as) =>
    as.map((a) => (a as HTMLAnchorElement).href)
  );

  const unique = Array.from(new Set(hrefs))
    .filter((h) => !h.includes("gift-card")) // skip gift card noise
    .map((h) => h.split("?")[0]); // drop ?variant= query params

  const deduped = Array.from(new Set(unique));
  return deduped.slice(0, limit);
}

/** Extract the ProductGroup JSON-LD block from a Shopify product page. */
async function scrapeProduct(page: Page, url: string): Promise<ScrapedProduct | null> {
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const jsonLdBlocks: string[] = await page.$$eval(
    'script[type="application/ld+json"]',
    (scripts) => scripts.map((s) => s.textContent || "")
  );

  for (const raw of jsonLdBlocks) {
    try {
      const data = JSON.parse(raw);
      if (data["@type"] === "ProductGroup") {
        const group = data as ShopifyProductGroup;
        const firstVariant = group.hasVariant?.[0];
        const price = firstVariant?.offers?.price ?? 0;
        const currency = firstVariant?.offers?.priceCurrency ?? "USD";

        return {
          sourceUrl: url,
          title: group.name,
          price,
          currency,
          description: (group.description || "").slice(0, 2000),
          imageUrls: group.image?.slice(0, 5) ?? [],
          category: group.category ?? null,
        };
      }
    } catch {
      // not valid JSON or not the block we want — skip it
      continue;
    }
  }

  console.warn(`  ! No ProductGroup JSON-LD found on ${url} — skipping`);
  return null;
}

async function scrapeSite(browser: Browser, collectionUrl: string, limit: number, label: string): Promise<ScrapedProduct[]> {
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  });

  console.log(`\n[${label}] Finding product URLs on ${collectionUrl} ...`);
  const urls = await collectProductUrls(page, collectionUrl, limit);
  console.log(`[${label}] Found ${urls.length} product URLs`);

  const results: ScrapedProduct[] = [];
  for (const url of urls) {
    console.log(`[${label}] Scraping ${url}`);
    try {
      const product = await scrapeProduct(page, url);
      if (product) results.push(product);
    } catch (err) {
      console.warn(`  ! Failed to scrape ${url}:`, (err as Error).message);
    }
    // small polite delay between requests
    await page.waitForTimeout(500);
  }

  await page.close();
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Starting scrape run...");
  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Ensure Brand + Competitor rows exist
    const brand = await prisma.brand.upsert({
      where: { name: TARGET_BRAND.name },
      update: {},
      create: {
        name: TARGET_BRAND.name,
        domain: TARGET_BRAND.domain,
        niche: TARGET_BRAND.niche,
      },
    });

    let competitor = await prisma.competitor.findFirst({
      where: { brandId: brand.id, name: COMPETITOR.name },
    });
    if (!competitor) {
      competitor = await prisma.competitor.create({
        data: {
          brandId: brand.id,
          name: COMPETITOR.name,
          domain: COMPETITOR.domain,
        },
      });
    }

    // 2. Scrape the target brand's own products
    const brandProducts = await scrapeSite(browser, TARGET_BRAND.collectionUrl, PRODUCTS_PER_SITE, TARGET_BRAND.name);

    // 3. Scrape the competitor's products (stored as CompetitorAd rows —
    //    title/description double as the "creative" the hook generator
    //    will draw inspiration from in step 3)
    const competitorProducts = await scrapeSite(browser, COMPETITOR.collectionUrl, PRODUCTS_PER_SITE, COMPETITOR.name);

    // 4. Clear old rows for a clean demo re-run, then insert fresh data
    await prisma.product.deleteMany({ where: { brandId: brand.id } });
    await prisma.competitorAd.deleteMany({ where: { competitorId: competitor.id } });

    if (brandProducts.length > 0) {
      await prisma.product.createMany({
        data: brandProducts.map((p) => ({
          brandId: brand.id,
          sourceUrl: p.sourceUrl,
          title: p.title,
          price: p.price,
          currency: p.currency,
          description: p.description,
          imageUrls: p.imageUrls,
          category: p.category,
        })),
      });
    }

    if (competitorProducts.length > 0) {
      await prisma.competitorAd.createMany({
        data: competitorProducts.map((p) => ({
          competitorId: competitor!.id,
          sourceUrl: p.sourceUrl,
          headline: p.title,
          bodyText: p.description,
          mediaUrl: p.imageUrls[0] ?? null,
          platform: "shopify_scrape",
        })),
      });
    }

    console.log(`\nDone.`);
    console.log(`  ${TARGET_BRAND.name}: ${brandProducts.length} products saved`);
    console.log(`  ${COMPETITOR.name}: ${competitorProducts.length} competitor items saved`);
    console.log(`\nOpen "npx prisma studio" to see the rows.`);
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Scrape run failed:", err);
  process.exit(1);
});
