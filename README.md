# Growth Engine Demo

A scaled-down demo of a **Multi-Brand E-Commerce Growth Engine** — an automation pipeline that scrapes competitor and product data, generates AI-written ad copy with distinct persuasion angles, builds matching landing pages, and surfaces simulated performance in a live dashboard.

Built as a learning/demo project to showcase an end-to-end automation architecture for e-commerce ad operations, using real scraped product data and a real LLM for copywriting — with ad performance simulated rather than run against real ad spend.

**Demo walkthrough (Loom):** https://www.loom.com/share/a0aa9fe8e89f4b69bc2ecf47094ce07e

---

## What it does

1. **Scrapes product & competitor data** — pulls real product titles, prices, descriptions, and images from a target brand and a competitor's storefront using their structured (JSON-LD) data.
2. **Generates AI ad copy** — for each product, calls an LLM (DeepSeek) to write multiple ad variants, each built around a distinct persuasion angle (urgency, social proof, benefit-led, problem-solution, curiosity) — giving a real A/B-test-style set of options per product.
3. **Auto-builds landing pages** — each ad variant gets its own landing page whose headline and copy match the ad exactly ("message match"), so the click-through experience stays consistent.
4. **Simulates performance data** — generates realistic impressions/clicks/conversions/spend per variant (angle-biased, not random) since no real ad account is connected in this demo. Clearly flagged `isSimulated: true` in the schema.
5. **Dashboard** — one view per product showing every ad variant side by side with its landing page link and performance (CTR, CVR, spend), auto-highlighting the best-converting variant.

## Tech stack

- **Next.js (App Router)** — Server Components, dynamic routes, no separate API layer
- **PostgreSQL + Prisma ORM** — schema, migrations, type-safe queries
- **Playwright** — headless scraping of Shopify product data
- **DeepSeek API** (OpenAI-compatible SDK) — ad copy generation
- **TypeScript** throughout, run via `tsx` (no build step for scripts)

## Project structure

```
prisma/schema.prisma        Data model: Brand, Product, Competitor, CompetitorAd, AdHook, LandingPage, Metric
lib/prisma.ts                Prisma client singleton
scripts/scrape.ts            Scrapes target + competitor product data
scripts/generate-hooks.ts    Generates AI ad copy variants per product
scripts/generate-landing-pages.ts   Builds a landing page per ad variant
scripts/seed-metrics.ts      Generates simulated performance data
app/lp/[slug]/page.tsx       Public landing page (message-matched to its ad)
app/dashboard/page.tsx       Main dashboard — all products, variants, and performance
```

## Running it locally

1. Install dependencies:
   ```
   npm install
   ```
2. Set up your `.env` (not committed — see `.gitignore`):
   ```
   DATABASE_URL="postgresql://user:password@localhost:5432/growth_engine"
   DEEPSEEK_API_KEY="your-deepseek-key"
   ```
3. Push the schema to your database:
   ```
   npx prisma db push
   ```
4. Run the pipeline, in order:
   ```
   npx tsx scripts/scrape.ts
   npx tsx scripts/generate-hooks.ts
   npx tsx scripts/generate-landing-pages.ts
   npx tsx scripts/seed-metrics.ts
   ```
5. Start the app:
   ```
   npm run dev
   ```
   Dashboard: `http://localhost:3000/dashboard`

## Notes

- This is a **demo/learning build**, not a production system — no real ad account integration, no real ad spend, single-brand scale.
- A production version of this architecture would add: real Meta/Google Ads API integration for live performance data, multi-brand support, scheduled/automated pipeline runs, and a review workflow before publishing ad variants live.

---

Built by [Muneeb Islam](mailto:muneebch6@gmail.com) — freelance AI automation developer.
