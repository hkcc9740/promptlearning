// Server-only: what a learner's plan lets them do right now.
import { and, count, eq, gte } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema, type Db } from "@/lib/db";
import type { UserRow } from "@/lib/db/schema";
import { PLANS, type Plan, type PlanId } from "@/lib/plans";
import { TZ_COOKIE, dayBounds, isValidTimeZone, monthBounds } from "@/lib/time-zone";

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * Complimentary Pro: comma-separated emails in the COMP_PRO_EMAILS env var
 * (e.g. the owner and testers) get Pro without a subscription.
 */
function isComplimentaryPro(email: string | null | undefined): boolean {
  if (!email) return false;
  // Accept the lowercase name too — env var names are case-sensitive and easy to mistype.
  const list = (process.env.COMP_PRO_EMAILS ?? process.env.comp_pro_emails ?? "")
    .split(",")
    .map((e) => e.trim().replace(/^["'<]+|["'>]+$/g, "").trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

export type Entitlements = {
  plan: Plan;
  /** Paid plan details, if any (for the pricing page / billing UI). */
  subscription: null | {
    plan: PlanId;
    interval: string | null;
    status: string;
    currentPeriodEnd: Date | null;
    introUsed: boolean;
  };
  hasStripeCustomer: boolean;
  introUsed: boolean;
  coursesStartedThisMonth: number;
  /** null = unlimited */
  coursesLeftThisMonth: number | null;
  lessonsCompletedToday: number;
  /** null = unlimited */
  lessonsLeftToday: number | null;
  /** When the monthly quota / daily lessons reset (learner's local midnight). */
  monthResetsAt: Date;
  dayResetsAt: Date;
  /** Local midnight today (start of the learner's day). */
  dayStartsAt: Date;
  timeZone: string;
};

// A learner may move their time zone at most once a day — enough for travel,
// not enough to farm extra lessons by hopping zones.
const TZ_CHANGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * The learner's effective time zone: the saved one, updated from the browser's
 * cookie when it differs (rate-limited). Falls back to UTC.
 */
async function resolveTimeZone(db: Db, user: UserRow | undefined): Promise<string> {
  const saved = user?.timeZone && isValidTimeZone(user.timeZone) ? user.timeZone : null;
  let fromBrowser: string | null = null;
  try {
    const raw = (await cookies()).get(TZ_COOKIE)?.value;
    const tz = raw ? decodeURIComponent(raw) : null;
    fromBrowser = isValidTimeZone(tz) ? tz : null;
  } catch {
    /* no request scope */
  }

  if (!user || !fromBrowser || fromBrowser === saved) return saved ?? fromBrowser ?? "UTC";

  const last = user.timeZoneUpdatedAt?.getTime() ?? 0;
  if (saved && Date.now() - last < TZ_CHANGE_COOLDOWN_MS) return saved;

  await db
    .update(schema.users)
    .set({ timeZone: fromBrowser, timeZoneUpdatedAt: new Date() })
    .where(eq(schema.users.id, user.id));
  return fromBrowser;
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const db = await getDb();
  const now = new Date();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const timeZone = await resolveTimeZone(db, user);
  const month = monthBounds(now, timeZone);
  const day = dayBounds(now, timeZone);
  const monthStart = month.start;
  const dayStart = day.start;

  const [[courses], [lessons]] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.enrollments)
      .where(
        and(eq(schema.enrollments.userId, userId), gte(schema.enrollments.startedAt, monthStart)),
      ),
    db
      .select({ n: count() })
      .from(schema.lessonCompletions)
      .where(
        and(
          eq(schema.lessonCompletions.userId, userId),
          gte(schema.lessonCompletions.completedAt, dayStart),
        ),
      ),
  ]);

  const paidActive =
    !!user &&
    (user.plan === "plus" || user.plan === "pro") &&
    ACTIVE_STATUSES.has(user.subscriptionStatus ?? "");
  const plan = isComplimentaryPro(user?.email)
    ? PLANS.pro
    : PLANS[paidActive ? (user.plan as PlanId) : "free"];

  const started = Number(courses?.n ?? 0);
  const done = Number(lessons?.n ?? 0);

  return {
    plan,
    subscription:
      user && user.subscriptionStatus && user.plan !== "free"
        ? {
            plan: user.plan as PlanId,
            interval: user.billingInterval,
            status: user.subscriptionStatus,
            currentPeriodEnd: user.currentPeriodEnd,
            introUsed: user.introUsed,
          }
        : null,
    hasStripeCustomer: !!user?.stripeCustomerId,
    introUsed: !!user?.introUsed,
    coursesStartedThisMonth: started,
    coursesLeftThisMonth:
      plan.coursesPerMonth === null ? null : Math.max(0, plan.coursesPerMonth - started),
    lessonsCompletedToday: done,
    lessonsLeftToday: plan.lessonsPerDay === null ? null : Math.max(0, plan.lessonsPerDay - done),
    monthResetsAt: month.end,
    dayResetsAt: day.end,
    dayStartsAt: day.start,
    timeZone,
  };
}
