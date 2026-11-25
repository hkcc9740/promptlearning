"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/lib/db";
import {
  introCouponId,
  isPaidPlan,
  priceLookupKey,
  type BillingInterval,
} from "@/lib/plans";
import { ensureUser, getSessionUser } from "@/lib/session";
import { getStripe, stripeConfigured } from "@/lib/stripe";

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Start Stripe Checkout for a paid plan. Redirects; returns an error string on failure. */
export async function startCheckoutAction(plan: string, interval: string): Promise<string | void> {
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent("/pricing")}`);
  if (!isPaidPlan(plan) || (interval !== "monthly" && interval !== "annual")) {
    return "Unknown plan.";
  }
  if (!stripeConfigured()) {
    return "Payments aren't set up yet (STRIPE_SECRET_KEY is missing).";
  }

  await ensureUser(user);
  const db = await getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  const stripe = getStripe();

  // Already subscribed → plan changes and cancellation happen in the billing portal.
  if (row?.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(row.subscriptionStatus ?? "")) {
    return openBillingPortalAction();
  }

  let customerId = row?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await db.update(schema.users).set({ stripeCustomerId: customerId }).where(eq(schema.users.id, user.id));
  }

  const lookupKey = priceLookupKey(plan, interval as BillingInterval);
  const prices = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) {
    return `Stripe price "${lookupKey}" not found — run scripts/stripe-setup.mjs first.`;
  }

  // The discounted first month: monthly plans, first subscription only.
  const useIntro = interval === "monthly" && !row?.introUsed;
  const base = await origin();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: price.id, quantity: 1 }],
    discounts: useIntro ? [{ coupon: introCouponId(plan) }] : undefined,
    subscription_data: { metadata: { userId: user.id } },
    success_url: `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/pricing?canceled=1`,
  });

  if (!session.url) return "Couldn't start checkout. Please try again.";
  redirect(session.url);
}

/** Stripe-hosted page to change plan, update card, see invoices or cancel. */
export async function openBillingPortalAction(): Promise<string | void> {
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent("/pricing")}`);
  if (!stripeConfigured()) return "Payments aren't set up yet.";

  const db = await getDb();
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
  if (!row?.stripeCustomerId) return "No billing account yet.";

  const portal = await getStripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${await origin()}/pricing`,
  });
  redirect(portal.url);
}
