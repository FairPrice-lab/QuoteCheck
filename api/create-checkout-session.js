// /api/create-checkout-session.js
// Creates a Stripe Checkout session for:
// - kind: "pass"   -> $17.99 device pass (30 days on this device/browser)
// - kind: "report" -> $6.99 one-time unlock for a specific quoteId (30 days on this device/browser)
//
// Uses your existing env vars:
// - STRIPE_SECRET_KEY
// - STRIPE_PRICE_SUB  (17.99)
// - STRIPE_PRICE_ONCE (6.99)

const Stripe = require("stripe");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const { kind, quoteId, quoteHash } = req.body || {}; // "pass" | "report"
    const isPass = kind === "pass";
    const isReport = kind === "report";

    if (!isPass && !isReport) {
      return res.status(400).json({ error: "Invalid kind. Use 'pass' or 'report'." });
    }

    if (isReport && !quoteId) {
      return res.status(400).json({ error: "Missing quoteId for report unlock." });
    }

    const priceId = isPass ? process.env.STRIPE_PRICE_SUB : process.env.STRIPE_PRICE_ONCE;
    if (!priceId) {
      return res.status(400).json({
        error: "Missing price env var",
        detail: isPass ? "STRIPE_PRICE_SUB" : "STRIPE_PRICE_ONCE",
      });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const baseParams = {
      payment_method_types: ["card"],
      phone_number_collection: { enabled: true },
      customer_creation: "always",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        kind,
        quoteId: quoteId || "",
        quoteHash: quoteHash || "",
      },
      success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=1`,
    };

    // Recommended: device pass should be a ONE-TIME price (mode: "payment").
    // If STRIPE_PRICE_SUB is actually a recurring price, Stripe will error.
    // In that case, we fall back to mode: "subscription" so checkout can still work.
    try {
      const session = await stripe.checkout.sessions.create({
        ...baseParams,
        mode: "payment",
      });
      return res.status(200).json({ url: session.url });
    } catch (e) {
      const msg = String(e?.message || "");
      const mightBeRecurring = msg.toLowerCase().includes("recurring") || msg.toLowerCase().includes("subscription");
      if (!isPass || !mightBeRecurring) throw e;

      // Fallback: recurring price used for pass -> create a subscription checkout.
      // NOTE: Without a webhook, access will last only until the first period end (typically 30 days),
      // even if the subscription renews.
      const session = await stripe.checkout.sessions.create({
        ...baseParams,
        mode: "subscription",
      });
      return res.status(200).json({ url: session.url });
    }
  } catch (e) {
    return res.status(500).json({ error: "Stripe session error", detail: String(e?.message || e) });
  }
};
