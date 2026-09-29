/**
 * The generated landing page itself — one per ad hook variant.
 *
 * This is a Next.js Server Component: it runs on the server for every
 * request, reads the LandingPage (+ its AdHook + Product) straight from
 * Postgres via Prisma, and renders HTML. No separate API route needed.
 *
 * "Message match": the headline/body shown here comes from the SAME
 * AdHook row the ad copy was generated into — so whatever hook someone
 * clicked on in the ad, this page continues that exact message rather
 * than showing generic product copy.
 *
 * Written for Next.js 15 (params is a Promise). If your project is on
 * Next.js 14, change the params type to `{ slug: string }` (no Promise)
 * and remove the `await` on the line that reads it.
 */

import { notFound } from "next/navigation";
import { prisma } from "../../../lib/prisma";

// Always read fresh from the database — this is a demo, not a static site.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function LandingPage({ params }: PageProps) {
  const { slug } = await params;

  const page = await prisma.landingPage.findUnique({
    where: { slug },
    include: {
      adHook: {
        include: { product: true },
      },
    },
  });

  if (!page) {
    notFound();
  }

  const { adHook } = page;
  const { product } = adHook;
  const heroImage = product.imageUrls[0];

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 80px", fontFamily: "system-ui, sans-serif" }}>
      {/* Hero: headline comes straight from the ad hook, not a generic template */}
      <section style={{ textAlign: "center", padding: "56px 0 32px" }}>
        <p style={{ letterSpacing: 2, fontSize: 12, color: "#888", textTransform: "uppercase", marginBottom: 12 }}>
          {adHook.variantLabel}
        </p>
        <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.15, margin: "0 0 16px" }}>{adHook.headline}</h1>
        <p style={{ fontSize: 18, color: "#444", maxWidth: 520, margin: "0 auto" }}>{adHook.bodyText}</p>
      </section>

      {/* Product image */}
      {heroImage && (
        <div style={{ borderRadius: 16, overflow: "hidden", marginBottom: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- demo page, external Shopify CDN image */}
          <img src={heroImage} alt={product.title} style={{ width: "100%", display: "block" }} />
        </div>
      )}

      {/* Product details */}
      <section style={{ textAlign: "center", marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>{product.title}</h2>
        <p style={{ fontSize: 20, color: "#111", fontWeight: 600 }}>
          {product.currency} {Number(product.price).toFixed(2)}
        </p>
      </section>

      {/* CTA — the one thing this page exists to get clicked */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <a
          href={product.sourceUrl}
          style={{
            display: "inline-block",
            background: "#111",
            color: "#fff",
            padding: "16px 40px",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 16,
            textDecoration: "none",
          }}
        >
          {adHook.cta}
        </a>
      </div>

      {/* Supporting description */}
      {product.description && (
        <section style={{ borderTop: "1px solid #eee", paddingTop: 32, color: "#555", lineHeight: 1.6 }}>
          <h3 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 1, color: "#999", marginBottom: 12 }}>
            Details
          </h3>
          <p style={{ whiteSpace: "pre-line" }}>{product.description}</p>
        </section>
      )}
    </main>
  );
}
