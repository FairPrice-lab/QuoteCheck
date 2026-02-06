// Simple endpoint that returns direct Stripe Payment Links.
// No Stripe SDK, no secret key required for this flow.

module.exports = async (req, res) => {
  const links = {
    one_time_report: "https://buy.stripe.com/5kQaEP5e12xuf1SgcocV200",
    unlimited_30_day: "https://buy.stripe.com/9B64grcGt4FCg5W0dqcV201"
  };

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Optional: allow caller to request one specific link
  const plan =
    (req.query && req.query.plan) ||
    (req.body && req.body.plan) ||
    null;

  if (plan === "one_time_report") {
    return res.status(200).json({ url: links.one_time_report, plan });
  }

  if (plan === "unlimited_30_day") {
    return res.status(200).json({ url: links.unlimited_30_day, plan });
  }

  return res.status(200).json({
    links,
    default: links.one_time_report
  });
};
