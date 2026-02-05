// /api/redeem.js
// Redeems a Stripe Checkout Session and grants device-bound access via signed cookie.
//
// - kind "pass": grants 30-day device pass (unlimited full checks on this device)
// - kind "report": grants one-time report unlock for quoteId (full report for that quote on this device)
//
// No DB required. Clearing cookies resets access.

const Stripe = require("stripe");
const {
  loadEntitlements,
  saveEntitlements,
  grantPass,
  grantReport,
  nowSec,
  PASS_DAYS,
} = require("./_entitlements");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: "Missing session_id" });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Expand subscription if this was a subscription checkout fallback
    const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ["subscription"] });

    // Validate payment completion
    const paid =
      session.payment_status === "paid" ||
      (session.mode === "subscription" && session.status === "complete");

    if (!paid) return res.status(402).json({ error: "Payment not completed." });

    const kind = session.metadata?.kind || "";
    const quoteId = session.metadata?.quoteId || "";
    const quoteHash = session.metadata?.quoteHash || "";

    const { ent } = loadEntitlements(req);

    let message = "Access activated on this device.";

    if (kind === "pass") {
      // If subscription mode, prefer expiry based on subscription period end.
      if (session.mode === "subscription" && session.subscription?.current_period_end) {
        const exp = Number(session.subscription.current_period_end);
        ent.passExp = Math.max(ent.passExp || 0, exp);
        message = "Pass activated on this device (until the current billing period ends).";
      } else {
        grantPass(ent);
        message = `Pass activated on this device (${PASS_DAYS} days).`;
      }
    } else if (kind === "report") {
      if (!quoteId) return res.status(400).json({ error: "Missing quoteId in session metadata." });
      grantReport(ent, quoteId, quoteHash);
      message = `Report unlocked for this quote on this device (${PASS_DAYS} days).`;
    } else {
      return res.status(400).json({ error: "Unknown purchase kind." });
    }

    saveEntitlements(res, ent);

    return res.status(200).json({
      ok: true,
      kind,
      message,
      now: nowSec(),
    });
  } catch (e) {
    return res.status(500).json({ error: "Redeem error", detail: String(e?.message || e) });
  }
};
