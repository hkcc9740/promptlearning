"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { openBillingPortalAction, startCheckoutAction } from "@/app/actions/billing";
import { PLANS, type BillingInterval, type Plan, type PlanId } from "@/lib/plans";

export type PricingViewer =
  | { signedIn: false; introAvailable: true }
  | {
      signedIn: true;
      currentPlan: PlanId;
      currentInterval: string | null;
      introAvailable: boolean;
      hasBilling: boolean;
      usage: {
        coursesStarted: number;
        coursesPerMonth: number | null;
        lessonsToday: number;
        lessonsPerDay: number | null;
      };
      renewsAt: string | null;
      status: string | null;
      email: string | null;
    };

export function PricingTable({
  viewer,
  paymentsReady,
}: {
  viewer: PricingViewer;
  paymentsReady: boolean;
}) {
  const [interval, setBilling] = useState<BillingInterval>("monthly");
  const [pending, startTransition] = useTransition();
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(id: string, fn: () => Promise<string | void>) {
    setBusyPlan(id);
    setError(null);
    startTransition(async () => {
      const msg = await fn();
      if (msg) setError(msg);
      setBusyPlan(null);
    });
  }

  const current = viewer.signedIn ? viewer.currentPlan : null;
  const paid = current === "plus" || current === "pro";

  return (
    <div>
      {viewer.signedIn && (
        <div className="card mb-8 flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4 text-sm">
          <span>
            <span className="text-muted">Your plan · </span>
            <strong>{PLANS[viewer.currentPlan].name}</strong>
            {viewer.currentInterval && <span className="text-muted"> ({viewer.currentInterval})</span>}
          </span>
          <span>
            <span className="text-muted">Courses this month · </span>
            <strong className="tabular-nums">
              {viewer.usage.coursesStarted}/{viewer.usage.coursesPerMonth ?? "∞"}
            </strong>
          </span>
          <span>
            <span className="text-muted">Lessons today · </span>
            <strong className="tabular-nums">
              {viewer.usage.lessonsToday}/{viewer.usage.lessonsPerDay ?? "∞"}
            </strong>
          </span>
          <span className="text-muted">
            Signed in as{" "}
            <strong className="text-ink">{viewer.email ?? "(GitHub didn’t share an email)"}</strong>
          </span>
          {viewer.hasBilling && paymentsReady && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run("portal", openBillingPortalAction)}
              className="ml-auto link-accent disabled:opacity-60"
            >
              {busyPlan === "portal" ? "Opening…" : "Manage billing →"}
            </button>
          )}
        </div>
      )}

      {/* interval toggle */}
      <div className="mb-8 inline-flex gap-1 rounded-full bg-bg-2 p-1 text-sm" role="radiogroup" aria-label="Billing period">
        {(["monthly", "annual"] as const).map((i) => (
          <button
            key={i}
            role="radio"
            aria-checked={interval === i}
            onClick={() => setBilling(i)}
            className={`rounded-full px-4 py-2 font-medium transition-colors ${
              interval === i ? "bg-white shadow-[var(--shadow-sm)] text-ink" : "text-ink-2"
            }`}
          >
            {i === "monthly" ? "Monthly" : "Annual · save up to 20%"}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6 items-stretch">
        {(Object.values(PLANS) as Plan[]).map((plan) => {
          const isCurrent = current === plan.id;
          const featured = plan.id === "plus";
          return (
            <div
              key={plan.id}
              className={`card relative flex flex-col p-7 ${featured ? "ring-2 ring-ink" : ""}`}
            >
              {featured && (
                <span className="absolute -top-3 left-7 rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h2 className="text-2xl font-semibold">{plan.name}</h2>
              <p className="text-sm text-muted mb-5">{plan.tagline}</p>

              <PriceBlock plan={plan} interval={interval} introAvailable={viewer.introAvailable} />

              <ul className="my-6 space-y-2.5 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-[0.95rem] text-ink-2">
                    <span aria-hidden className="text-ink">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {plan.price === null ? (
                viewer.signedIn ? (
                  <span className="btn btn-ghost w-full pointer-events-none opacity-70">
                    {isCurrent ? "Current plan" : "Included"}
                  </span>
                ) : (
                  <Link href="/signin?next=%2Fpricing" className="btn btn-ghost w-full">
                    Start free
                  </Link>
                )
              ) : !viewer.signedIn ? (
                <Link href="/signin?next=%2Fpricing" className="btn btn-primary w-full">
                  Sign in to upgrade
                </Link>
              ) : isCurrent ? (
                <span className="btn btn-ghost w-full pointer-events-none opacity-70">Current plan</span>
              ) : (
                <button
                  type="button"
                  disabled={pending || !paymentsReady}
                  onClick={() =>
                    run(plan.id, () =>
                      paid ? openBillingPortalAction() : startCheckoutAction(plan.id, interval),
                    )
                  }
                  className={`btn w-full disabled:opacity-60 ${featured ? "btn-primary" : "btn-dark"}`}
                >
                  {busyPlan === plan.id
                    ? "Opening checkout…"
                    : paid
                      ? `Switch to ${plan.name}`
                      : `Get ${plan.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!paymentsReady && (
        <p className="mt-6 text-sm text-muted">
          Payments aren’t connected yet. Add Stripe keys to enable checkout.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-6 text-sm text-ink-2">
          {error}
        </p>
      )}
    </div>
  );
}

function PriceBlock({
  plan,
  interval,
  introAvailable,
}: {
  plan: Plan;
  interval: BillingInterval;
  introAvailable: boolean;
}) {
  if (!plan.price) {
    return (
      <div>
        <span className="text-4xl font-semibold tracking-tight">$0</span>
        <p className="mt-1 text-sm text-muted">Free forever</p>
      </div>
    );
  }
  const p = plan.price;

  if (interval === "annual") {
    return (
      <div>
        <span className="text-4xl font-semibold tracking-tight">${p.annualPerMonth}</span>
        <span className="text-muted"> /month</span>
        <p className="mt-1 text-sm text-muted">
          Billed ${p.annualPerMonth * 12} yearly{" "}
          <span className="text-ink-2">(save ${(p.monthly - p.annualPerMonth) * 12})</span>
        </p>
      </div>
    );
  }

  return introAvailable ? (
    <div>
      <span className="text-4xl font-semibold tracking-tight">${p.introFirstMonth}</span>
      <span className="text-muted"> first month</span>
      <p className="mt-1 text-sm text-muted">then ${p.monthly}/month</p>
    </div>
  ) : (
    <div>
      <span className="text-4xl font-semibold tracking-tight">${p.monthly}</span>
      <span className="text-muted"> /month</span>
      <p className="mt-1 text-sm text-muted">Billed monthly</p>
    </div>
  );
}
