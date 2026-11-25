// Plans, limits and prices — the single source of truth for pricing.
// Safe to import from client components (no secrets, no server deps).

export type PlanId = "free" | "plus" | "pro";
export type BillingInterval = "monthly" | "annual";

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  /** Courses a learner may START per calendar month (UTC). null = unlimited. */
  coursesPerMonth: number | null;
  /** Lessons a learner may complete per day (UTC), Duolingo-style. null = own pace. */
  lessonsPerDay: number | null;
  /** Can copy the whole course as one prompt (vs. one lesson at a time). */
  wholeCoursePrompt: boolean;
  price: null | {
    monthly: number; // USD / month, billed monthly
    annualPerMonth: number; // USD / month, billed yearly
    introFirstMonth: number; // USD for the first month of a monthly plan
  };
  features: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Build the habit",
    coursesPerMonth: 1,
    lessonsPerDay: 1,
    wholeCoursePrompt: false,
    price: null,
    features: [
      "1 course a month",
      "1 lesson a day: a steady, paced path",
      "Every catalog course + generate your own",
    ],
  },
  plus: {
    id: "plus",
    name: "Plus",
    tagline: "Learn at your pace",
    coursesPerMonth: 6,
    lessonsPerDay: null,
    wholeCoursePrompt: true,
    price: { monthly: 5, annualPerMonth: 4, introFirstMonth: 1 },
    features: [
      "6 courses a month",
      "Unlimited lessons a day",
      "Run a whole course in one chat",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "Learn everything",
    coursesPerMonth: null,
    lessonsPerDay: null,
    wholeCoursePrompt: true,
    price: { monthly: 20, annualPerMonth: 18, introFirstMonth: 10 },
    features: [
      "Unlimited courses",
      "Unlimited lessons a day",
      "Run a whole course in one chat",
    ],
  },
};

export const PAID_PLANS = ["plus", "pro"] as const;
export type PaidPlanId = (typeof PAID_PLANS)[number];

export function isPaidPlan(id: string): id is PaidPlanId {
  return (PAID_PLANS as readonly string[]).includes(id);
}

/** Stripe price lookup keys (created by scripts/stripe-setup.mjs). */
export function priceLookupKey(plan: PaidPlanId, interval: BillingInterval): string {
  return `${plan}_${interval}`;
}

export function parseLookupKey(
  key: string | null | undefined,
): { plan: PaidPlanId; interval: BillingInterval } | null {
  const m = /^(plus|pro)_(monthly|annual)$/.exec(key ?? "");
  return m ? { plan: m[1] as PaidPlanId, interval: m[2] as BillingInterval } : null;
}

/** Stripe coupon ids for the discounted first month (monthly plans only). */
export function introCouponId(plan: PaidPlanId): string {
  return `${plan}_first_month`;
}
