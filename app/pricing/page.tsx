import type { Metadata } from "next";
import { PricingTable, type PricingViewer } from "@/components/pricing-table";
import { getEntitlements } from "@/lib/entitlements";
import { getSessionUser } from "@/lib/session";
import { stripeConfigured } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Start free with a lesson a day. Upgrade to learn more, faster.",
};

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string; canceled?: string }>;
}) {
  const { upgraded, canceled } = await searchParams;
  const user = await getSessionUser();
  const ent = user ? await getEntitlements(user.id) : null;

  const viewer: PricingViewer = ent
    ? {
        signedIn: true,
        currentPlan: ent.plan.id,
        currentInterval: ent.subscription?.interval ?? null,
        introAvailable: !ent.introUsed,
        hasBilling: ent.hasStripeCustomer,
        usage: {
          coursesStarted: ent.coursesStartedThisMonth,
          coursesPerMonth: ent.plan.coursesPerMonth,
          lessonsToday: ent.lessonsCompletedToday,
          lessonsPerDay: ent.plan.lessonsPerDay,
        },
        renewsAt: ent.subscription?.currentPeriodEnd?.toISOString() ?? null,
        status: ent.subscription?.status ?? null,
      }
    : { signedIn: false, introAvailable: true };

  return (
    <div className="wrap py-16">
      <header className="max-w-2xl mb-10">
        <span className="eyebrow mb-4">Pricing</span>
        <h1 className="text-4xl sm:text-5xl mb-4">Learn a little every day. Or a lot.</h1>
        <p className="text-lg text-ink-2 leading-relaxed">
          Free gets you a course a month and a lesson a day. Upgrade to learn more
          courses, at your own pace.
        </p>
      </header>

      {upgraded && (
        <Banner>
          🎉 Payment received. Your plan is active. If it still shows Free, refresh in a moment.
        </Banner>
      )}
      {canceled && <Banner>Checkout canceled. You haven’t been charged.</Banner>}

      <PricingTable viewer={viewer} paymentsReady={stripeConfigured()} />

      <p className="mt-10 text-sm text-muted max-w-2xl">
        Prices in USD. “Courses” means courses you start, from the catalog or generated
        yourself, counted per calendar month. Lessons reset at midnight your local time. Cancel
        anytime from Manage billing. Your plan stays active until the end of the paid period.
      </p>
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="mb-8 rounded-[var(--radius)] border border-line bg-bg-2 px-5 py-4 text-sm text-ink-2">
      {children}
    </div>
  );
}
