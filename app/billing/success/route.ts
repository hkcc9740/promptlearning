import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getStripe, syncSubscription } from "@/lib/stripe";

// Checkout redirects here. Sync right away so the upgrade shows instantly,
// even before (or without) the webhook arriving — e.g. in local dev.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  const user = await getSessionUser();
  const done = new URL("/pricing?upgraded=1", req.url);

  if (!sessionId || !user) return NextResponse.redirect(done);

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    const sub = session.subscription;
    if (session.client_reference_id === user.id && sub && typeof sub !== "string") {
      await syncSubscription(sub);
    }
  } catch (e) {
    console.error("Checkout success sync failed", e);
  }
  return NextResponse.redirect(done);
}
