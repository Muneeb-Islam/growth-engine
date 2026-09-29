export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "80px auto", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <h1>Growth Engine Demo</h1>
      <p style={{ color: "#555" }}>
        This is just a placeholder home page. Generated landing pages live at{" "}
        <code>/lp/&lt;slug&gt;</code> — run <code>npx tsx scripts/generate-landing-pages.ts</code>{" "}
        to see the slugs it created.
      </p>
    </main>
  );
}
