/**
 * The dashboard — the payoff screen for the whole demo.
 *
 * Ties together everything the earlier steps built: for each scraped
 * product, shows every generated ad hook, its matching landing page link,
 * and its (simulated) performance — sorted so the best-converting hook
 * per product is easy to spot at a glance.
 *
 * Like the landing pages, this is a Next.js Server Component: it reads
 * straight from Postgres on every request, no separate API layer needed.
 */

import Link from "next/link";
import { prisma } from "../../lib/prisma";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// Explicit shape of what our query below returns — avoids relying on
// inference for the nested `include`, which keeps this correct even if
// the generated Prisma client's types are ever out of sync.
type ProductWithHooks = Prisma.ProductGetPayload<{
  include: {
    adHooks: {
      include: {
        landingPages: true;
        metrics: true;
      };
    };
  };
}>;
type HookWithRelations = ProductWithHooks["adHooks"][number];

interface HookRow {
  id: string;
  variantLabel: string;
  headline: string;
  cta: string;
  slug: string | null;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  ctr: number; // percent
  cvr: number; // percent
}

export default async function Dashboard() {
  const brand = await prisma.brand.findFirst({ where: { name: "Gymshark" } });

  if (!brand) {
    return (
      <main style={{ maxWidth: 640, margin: "80px auto", fontFamily: "system-ui, sans-serif" }}>
        <p>No brand found. Run the scraper first: <code>npx tsx scripts/scrape.ts</code></p>
      </main>
    );
  }

  const products: ProductWithHooks[] = await prisma.product.findMany({
    where: { brandId: brand.id },
    include: {
      adHooks: {
        include: {
          landingPages: true,
          metrics: true,
        },
      },
    },
  });

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "48px 20px 80px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Growth Engine Dashboard</h1>
      <p style={{ color: "#666", marginBottom: 40 }}>
        {brand.name} — {products.length} products scraped, hooks generated, landing pages live.
        Performance below is simulated for this demo (no real ad spend).
      </p>

      {products.map((product: ProductWithHooks) => {
        const rows: HookRow[] = product.adHooks.map((hook: HookWithRelations) => {
          const landingPage = hook.landingPages[0] ?? null;
          const metric = hook.metrics[0] ?? null;

          const impressions = metric?.impressions ?? 0;
          const clicks = metric?.clicks ?? 0;
          const conversions = metric?.conversions ?? 0;
          const spend = metric ? Number(metric.spend) : 0;

          return {
            id: hook.id,
            variantLabel: hook.variantLabel,
            headline: hook.headline,
            cta: hook.cta,
            slug: landingPage?.slug ?? null,
            impressions,
            clicks,
            conversions,
            spend,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
            cvr: clicks > 0 ? (conversions / clicks) * 100 : 0,
          };
        });

        // Best-converting hook for this product, if any has data.
        const winnerId = rows.length
          ? rows.reduce((best, r) => (r.cvr > best.cvr ? r : best), rows[0]).id
          : null;

        return (
          <section
            key={product.id}
            style={{ marginBottom: 40, border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", background: "#fafafa" }}>
              {product.imageUrls[0] && (
                // eslint-disable-next-line @next/next/no-img-element -- demo page, external Shopify CDN image
                <img
                  src={product.imageUrls[0]}
                  alt={product.title}
                  style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }}
                />
              )}
              <div>
                <div style={{ fontWeight: 700 }}>{product.title}</div>
                <div style={{ color: "#888", fontSize: 14 }}>
                  {product.currency} {Number(product.price).toFixed(2)}
                </div>
              </div>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#888", borderBottom: "1px solid #eee" }}>
                  <th style={{ padding: "10px 20px" }}>Variant</th>
                  <th style={{ padding: "10px" }}>Headline</th>
                  <th style={{ padding: "10px" }}>Impr.</th>
                  <th style={{ padding: "10px" }}>Clicks</th>
                  <th style={{ padding: "10px" }}>CTR</th>
                  <th style={{ padding: "10px" }}>Conv.</th>
                  <th style={{ padding: "10px" }}>CVR</th>
                  <th style={{ padding: "10px" }}>Spend</th>
                  <th style={{ padding: "10px 20px" }}>Page</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: "1px solid #f3f3f3",
                      background: row.id === winnerId ? "#f0fdf4" : "transparent",
                    }}
                  >
                    <td style={{ padding: "10px 20px", fontWeight: row.id === winnerId ? 700 : 400 }}>
                      {row.id === winnerId ? "🏆 " : ""}
                      {row.variantLabel}
                    </td>
                    <td style={{ padding: "10px", maxWidth: 220 }}>{row.headline}</td>
                    <td style={{ padding: "10px" }}>{row.impressions.toLocaleString()}</td>
                    <td style={{ padding: "10px" }}>{row.clicks.toLocaleString()}</td>
                    <td style={{ padding: "10px" }}>{row.ctr.toFixed(2)}%</td>
                    <td style={{ padding: "10px" }}>{row.conversions.toLocaleString()}</td>
                    <td style={{ padding: "10px" }}>{row.cvr.toFixed(2)}%</td>
                    <td style={{ padding: "10px" }}>${row.spend.toFixed(2)}</td>
                    <td style={{ padding: "10px 20px" }}>
                      {row.slug ? (
                        <Link href={`/lp/${row.slug}`} style={{ color: "#2563eb" }} target="_blank">
                          View →
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </main>
  );
}
