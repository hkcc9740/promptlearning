// One-time (idempotent) Stripe setup: products, prices and first-month coupons.
// Run with your TEST secret key first:
//   node --env-file=.env.local scripts/stripe-setup.mjs
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY in .env.local first.");
  process.exit(1);
}
const stripe = new Stripe(key);
console.log(key.startsWith("sk_live_") ? "⚠️  LIVE mode" : "Test mode");

// Keep in sync with lib/plans.ts
const PLANS = [
  { id: "plus", name: "Prompt Learning Plus", monthly: 5, annualPerMonth: 4, intro: 1 },
  { id: "pro", name: "Prompt Learning Pro", monthly: 20, annualPerMonth: 18, intro: 10 },
];

for (const p of PLANS) {
  const keys = [`${p.id}_monthly`, `${p.id}_annual`];
  const existing = await stripe.prices.list({ lookup_keys: keys, active: true, expand: ["data.product"] });
  let productId = existing.data[0]
    ? typeof existing.data[0].product === "string" ? existing.data[0].product : existing.data[0].product.id
    : null;

  if (!productId) {
    const product = await stripe.products.create({ name: p.name, metadata: { plan: p.id } });
    productId = product.id;
    console.log(`Created product ${p.name} (${productId})`);
  }

  const have = new Set(existing.data.map((x) => x.lookup_key));
  if (!have.has(`${p.id}_monthly`)) {
    await stripe.prices.create({
      product: productId, currency: "usd", unit_amount: p.monthly * 100,
      recurring: { interval: "month" }, lookup_key: `${p.id}_monthly`,
      nickname: `${p.name} — monthly`,
    });
    console.log(`Created ${p.id}_monthly: $${p.monthly}/mo`);
  }
  if (!have.has(`${p.id}_annual`)) {
    await stripe.prices.create({
      product: productId, currency: "usd", unit_amount: p.annualPerMonth * 12 * 100,
      recurring: { interval: "year" }, lookup_key: `${p.id}_annual`,
      nickname: `${p.name} — annual ($${p.annualPerMonth}/mo)`,
    });
    console.log(`Created ${p.id}_annual: $${p.annualPerMonth * 12}/yr`);
  }

  const couponId = `${p.id}_first_month`;
  try {
    await stripe.coupons.retrieve(couponId);
  } catch {
    await stripe.coupons.create({
      id: couponId, currency: "usd", amount_off: (p.monthly - p.intro) * 100,
      duration: "once", name: `First month $${p.intro}`,
      applies_to: { products: [productId] },
    });
    console.log(`Created coupon ${couponId}: first month $${p.intro}`);
  }
}
console.log("✓ Stripe is set up.");
