// /api/config.js
// Safe endpoint to confirm publishable key exists (no secrets exposed)

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null
  });
};
