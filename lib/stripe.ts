// Server-only: Stripe client + syncing subscriptions into the users table.
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { parseLookupKey } from "@/lib/plans";

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Lazily created so builds and pages work before Stripe keys exist. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  client ??= new Stripe(key);
  return client;
}

/**
 * Copy a subscription's state onto its user. The user is found by the
 * `userId` we put in subscription metadata at checkout, falling back to the
 * Stripe customer id.
 */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const db = await getDb();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const item = sub.items.data[0];
  const parsed = parseLookupKey(item?.price.lookup_key);

  const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
  const values = {
    plan: parsed && !ended ? parsed.plan : "free",
    billingInterval: parsed?.interval ?? null,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    introUsed: true, // any subscription — even an incomplete one — uses up the intro offer
    updatedAt: new Date(),
  };

  const userId = sub.metadata?.userId;
  if (userId) {
    await db.update(schema.users).set(values).where(eq(schema.users.id, userId));
  } else {
    await db
      .update(schema.users)
      .set(values)
      .where(eq(schema.users.stripeCustomerId, customerId));
  }
}
