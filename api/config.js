export function getAppUrl(req) {
  // Prefer explicit APP_URL for production correctness
  const appUrl = process.env.APP_URL;
  if (appUrl) return appUrl.replace(/\/+$/, "");

  // Fallback to request origin
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  return `${proto}://${host}`;
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY env var");
  const Stripe = (await import("stripe")).default;
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

export function getPrices() {
  const report = process.env.STRIPE_PRICE_REPORT;
  const pass = process.env.STRIPE_PRICE_PASS;
  if (!report) throw new Error("Missing STRIPE_PRICE_REPORT env var");
  if (!pass) throw new Error("Missing STRIPE_PRICE_PASS env var");
  return { report, pass };
}
