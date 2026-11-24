"use server";

import { auth } from "@/auth";
import { generateCourseFromUrl, type GenResult } from "@/lib/generate";

/**
 * Generate a course from a pasted link.
 *
 * Auth is enforced here, not just in the UI: a Server Action is a public POST
 * endpoint, so render-time gating is not a security boundary (see Next.js
 * "Server Actions and Mutations" → Security).
 */
export async function generateCourseAction(url: string): Promise<GenResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Please sign in to generate a course." };
  }

  if (typeof url !== "string" || url.length > 2000) {
    return { ok: false, error: "Please paste a single course link." };
  }

  return generateCourseFromUrl(url);
}
