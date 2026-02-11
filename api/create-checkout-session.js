import Stripe from "stripe";
import { getAppUrl, getPrices } from "./config.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
    }

    const { report: REPORT_PRICE_ID, pass: PASS_PRICE_ID } = getPrices();
    const appUrl = getAppUrl(req);

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const kind = body?.kind; // "report" or "pass"
    const quoteId = body?.quoteId || null;
    const quoteHash = body?.quoteHash || null;
    const abVariant = body?.abVariant || null;

    if (kind !== "report" && kind !== "pass") {
      return res.status(400).json({ error: "Invalid kind" });
    }
    if (kind === "report" && !quoteId) {
      return res.status(400).json({ error: "quoteId required for report unlock" });
    }

    const priceId = kind === "report" ? REPORT_PRICE_ID : PASS_PRICE_ID;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/`,
      allow_promotion_codes: true,
      metadata: {
        kind,
        quoteId: quoteId || "",
        quoteHash: quoteHash || "",
        abVariant: abVariant || ""
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({
      error: "Stripe session error",
      detail: String(err?.message || err)
    });
  }
}
