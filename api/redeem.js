import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

function setCookie(res, name, value, maxAgeSeconds) {
  const secure = true;
  const sameSite = "Lax";
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=/`,
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=${sameSite}`,
    secure ? "Secure" : "",
    "HttpOnly"
  ].filter(Boolean);

  // allow multiple cookies
  const prev = res.getHeader("Set-Cookie");
  const next = Array.isArray(prev) ? prev.concat(parts.join("; ")) : prev ? [prev, parts.join("; ")] : [parts.join("; ")];
  res.setHeader("Set-Cookie", next);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const session_id = body?.session_id;

    if (!session_id) return res.status(400).json({ error: "Missing session_id" });

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (!session || session.payment_status !== "paid") {
      return res.status(402).json({ error: "Payment not completed" });
    }

    const kind = session.metadata?.kind || "";
    const quoteId = session.metadata?.quoteId || "";
    const quoteHash = session.metadata?.quoteHash || "";

    // Entitlements:
    // - pass: 30 days full access on this device
    // - report: unlock full report for this quoteId/hash on this device
    if (kind === "pass") {
      // 30 days
      setCookie(res, "fp_pass", "1", 30 * 24 * 60 * 60);
      return res.status(200).json({ ok: true, message: "Full access activated for 30 days on this device." });
    }

    if (kind === "report") {
      // 30 days to view this report again (same device)
      const token = `${quoteId}.${quoteHash || ""}`;
      setCookie(res, "fp_report", token, 30 * 24 * 60 * 60);
      return res.status(200).json({ ok: true, message: "Report unlocked on this device." });
    }

    return res.status(400).json({ error: "Unknown entitlement kind" });
  } catch (err) {
    return res.status(500).json({ error: "Redeem error", detail: String(err?.message || err) });
  }
}
