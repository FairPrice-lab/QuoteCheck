// /api/_entitlements.js
// Device-bound entitlements stored in a signed, HttpOnly cookie.
// - $17.99 pass: unlimited FULL checks for 30 days on this device/browser.
// - $6.99 report: unlock FULL report for a specific quoteId for 30 days on this device/browser.
//
// No database required. If user clears cookies or switches devices, access is lost (by design).

const crypto = require("crypto");

const COOKIE_NAME = "fp_ent";
const PASS_DAYS = 30;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(str) {
  str = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

function hmacSha256(secret, data) {
  return crypto.createHmac("sha256", secret).update(data).digest();
}

function secret() {
  return process.env.FAIRPRICE_COOKIE_SECRET || process.env.STRIPE_SECRET_KEY || "dev_secret_change_me";
}

function sign(payloadObj) {
  const payloadJson = JSON.stringify(payloadObj);
  const payloadB64 = b64urlEncode(payloadJson);
  const sigB64 = b64urlEncode(hmacSha256(secret(), payloadB64));
  return `${payloadB64}.${sigB64}`;
}

function verify(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  const expected = b64urlEncode(hmacSha256(secret(), payloadB64));
  // constant-time compare
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  try {
    const obj = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((kv) => {
      const idx = kv.indexOf("=");
      const k = kv.slice(0, idx);
      const v = kv.slice(idx + 1);
      out[k] = decodeURIComponent(v || "");
    });
  return out;
}

function setCookie(res, value, maxAgeSec) {
  const secure = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAgeSec}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function emptyEntitlements() {
  return { v: 1, passExp: 0, reports: {} };
}

function prune(ent) {
  const n = nowSec();
  if (!ent || typeof ent !== "object") ent = emptyEntitlements();
  ent.v = 1;
  ent.passExp = Number(ent.passExp || 0);
  ent.reports = ent.reports && typeof ent.reports === "object" ? ent.reports : {};

  for (const [qid, rec] of Object.entries(ent.reports)) {
    const exp = Number(rec?.exp || 0);
    if (!exp || exp <= n) delete ent.reports[qid];
  }
  return ent;
}

function loadEntitlements(req) {
  const c = parseCookies(req);
  const token = c[COOKIE_NAME];
  const ent = prune(verify(token) || emptyEntitlements());
  return { token, ent };
}

function saveEntitlements(res, ent) {
  ent = prune(ent);
  // Keep cookie TTL at least as long as the longest entitlement.
  const n = nowSec();
  const reportExps = Object.values(ent.reports || {}).map((r) => Number(r?.exp || 0));
  const maxExp = Math.max(ent.passExp || 0, ...reportExps, n + 60);
  const ttl = Math.max(60, maxExp - n);
  setCookie(res, sign(ent), ttl);
  return ttl;
}

function grantPass(ent) {
  ent = prune(ent);
  const exp = nowSec() + PASS_DAYS * 24 * 60 * 60;
  ent.passExp = Math.max(ent.passExp || 0, exp);
  return ent;
}

function grantReport(ent, quoteId, quoteHash) {
  ent = prune(ent);
  const exp = nowSec() + PASS_DAYS * 24 * 60 * 60;
  ent.reports[quoteId] = { exp, h: quoteHash || "" };
  return ent;
}

function hasPass(ent) {
  ent = prune(ent);
  return Number(ent.passExp || 0) > nowSec();
}

function hasReport(ent, quoteId, currentHash) {
  ent = prune(ent);
  const rec = ent.reports?.[quoteId];
  if (!rec) return false;
  const exp = Number(rec.exp || 0);
  if (exp <= nowSec()) return false;
  if (rec.h && currentHash && rec.h !== currentHash) return false;
  return true;
}

module.exports = {
  COOKIE_NAME,
  PASS_DAYS,
  nowSec,
  loadEntitlements,
  saveEntitlements,
  grantPass,
  grantReport,
  hasPass,
  hasReport,
};
