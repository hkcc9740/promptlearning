"use server";

import { cookies } from "next/headers";
import { signIn, signOut } from "@/auth";

const GUEST_COOKIE = "pa_guest_id";

export async function signInWith(providerId: string, redirectTo: string = "/courses") {
  if (providerId === "credentials") {
    // Reuse this browser's guest id so the same guest gets the same library.
    const store = await cookies();
    let guestId = store.get(GUEST_COOKIE)?.value;
    if (!guestId) {
      guestId = crypto.randomUUID();
      store.set(GUEST_COOKIE, guestId, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    await signIn(providerId, { guestId, redirectTo });
    return;
  }
  await signIn(providerId, { redirectTo });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
