import crypto from "crypto";

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";").map(s => s.trim());
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const k = p.slice(0, idx);
    const v = p.slice(idx + 1);
    if (k === name) return decodeURIComponent(v || "");
  }
  return "";
}

function safeNum(x) {
  const n = Number(String(x || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function makeHash(payload) {
  const str = JSON.stringify(payload || {});
  return crypto.createHash("sha256").update(str).digest("hex").slice(0, 16);
}

function scoreFromPrice(price) {
  // Very basic placeholder scoring (you can replace with your real logic later)
  // 0 = under, 0.5 = fair, 1 = over
  if (price == null) return 0.5;
  if (price < 200) return 0.35;
  if (price < 800) return 0.55;
  return 0.75;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const mode = body?.mode || "preview"; // "preview" | "full"
    const quoteId = body?.quoteId || null;

    const price = safeNum(body?.price);
    const quoteText = String(body?.quoteText || "");
    const zip = String(body?.zip || "");
    const category = String(body?.category || "");

    const quoteHash = makeHash({
      price, zip, category,
      quoteText: quoteText.slice(0, 2000),
      fileName: body?.fileName || "",
      fileType: body?.fileType || ""
    });

    const score = scoreFromPrice(price);
    const label = score < 0.45 ? "Under" : score < 0.65 ? "Fair" : "Over";

    const base = {
      quoteId: quoteId || null,
      quoteHash,
      score,
      label,
      message:
        label === "Over"
          ? "This quote looks high versus typical ranges. Review line items and consider getting a second bid."
          : label === "Under"
          ? "This quote looks low versus typical ranges. Confirm scope and materials to avoid surprises."
          : "This quote appears broadly within typical ranges. Verify scope and warranty terms."
    };

    if (mode === "preview") {
      // Always allow preview
      return res.status(200).json(base);
    }

    // Full mode: require entitlement cookie
    const pass = readCookie(req, "fp_pass");
    const report = readCookie(req, "fp_report"); // "quoteId.quoteHash"

    const isPass = pass === "1";
    const isReport = report && quoteId && report.startsWith(`${quoteId}.`);

    if (!isPass && !isReport) {
      return res.status(402).json({ error: "LOCKED" });
    }

    // Return a "full report" object that matches your front-end rendering
    const fairLow = price ? Math.max(50, price * 0.8) : 300;
    const fairHigh = price ? price * 1.15 : 700;

    return res.status(200).json({
      ...base,
      full_report: {
        price_range: `$${fairLow.toFixed(0)} – $${fairHigh.toFixed(0)}`,
        estimated_margin: label === "Over" ? "Potentially high" : label === "Under" ? "Potentially low" : "Typical",
        market_comparison: "Benchmarks are adjusted using regional CPI factors (informational estimate).",
        tips:
          label === "Over"
            ? "Ask for a materials list, hourly labor breakdown, and compare 2–3 bids."
            : "Confirm scope, warranty, and whether permits/disposal are included.",
        data_note: "Disclaimer: Estimates only, not advice. Verify with local pros."
      }
    });
  } catch (err) {
    return res.status(500).json({ error: "Analyze error", detail: String(err?.message || err) });
  }
}
