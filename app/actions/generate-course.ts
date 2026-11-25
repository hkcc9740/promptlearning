"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { generateCourseFromSources, normalizeUrl, type GeneratedCourse } from "@/lib/generate";
import { MAX_SOURCES, SOURCE_GROUPS, type ShelfSource, type SourceKind } from "@/lib/sources/kinds";
import { GEMINI_FILE_PREFIX } from "@/lib/sources/gemini-files";
import { canStartCourse, genRef, startCourse } from "@/lib/enrollments";
import { deleteMyCourse, saveGeneratedCourse, updateMyCourseIdentity } from "@/lib/library";
import { getSessionUser } from "@/lib/session";

export type GenerateActionResult =
  | { ok: true; course: GeneratedCourse; savedId: string | null; saveError?: string }
  | { ok: false; error: string };

const KINDS = new Set<SourceKind>(SOURCE_GROUPS.map((g) => g.kind));
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** Sources come from the browser: rebuild each one from validated fields only. */
function sanitizeSources(input: unknown): ShelfSource[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SOURCES) return null;
  const out: ShelfSource[] = [];
  for (const raw of input) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const kind = r.kind as SourceKind;
    const title = str(r.title, 300)?.trim();
    if (!KINDS.has(kind) || !title) return null;

    const url = typeof r.url === "string" ? normalizeUrl(r.url) ?? undefined : undefined;
    const f = (r.file ?? null) as { uri?: unknown; mimeType?: unknown } | null;
    const file =
      f && typeof f.uri === "string" && f.uri.startsWith(GEMINI_FILE_PREFIX) && f.mimeType === "application/pdf"
        ? { uri: f.uri, mimeType: "application/pdf" }
        : undefined;
    const b = (r.book ?? null) as Record<string, unknown> | null;
    const book = b
      ? {
          authors: Array.isArray(b.authors) ? b.authors.filter((a) => typeof a === "string").slice(0, 3).map((a) => (a as string).slice(0, 120)) : [],
          year: typeof b.year === "number" ? b.year : undefined,
          subjects: Array.isArray(b.subjects) ? b.subjects.filter((x) => typeof x === "string").slice(0, 8).map((x) => (x as string).slice(0, 80)) : undefined,
        }
      : undefined;

    out.push({
      id: str(r.id, 64) ?? String(out.length),
      kind,
      title,
      subtitle: str(r.subtitle, 200),
      url,
      text: str(r.text, 8000),
      file,
      book,
      quality: r.quality === "ready" ? "ready" : "partial",
    });
  }
  return out;
}

/**
 * Generate a course from the learner's Source shelf, then save it to their library.
 *
 * Auth is enforced here, not just in the UI: a Server Action is a public POST
 * endpoint, so render-time gating is not a security boundary (see Next.js
 * "Server Actions and Mutations" → Security).
 */
export async function generateCourseAction(
  rawSources: unknown,
  rawFocus: unknown = "",
): Promise<GenerateActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Please sign in to generate a course." };
  }

  const sources = sanitizeSources(rawSources);
  if (!sources) {
    return { ok: false, error: `Add between 1 and ${MAX_SOURCES} sources.` };
  }
  const focus = typeof rawFocus === "string" ? rawFocus.trim().slice(0, 300) : "";

  // Generating a course starts it, so it counts toward the monthly quota.
  // Check BEFORE calling the AI so we don't spend a generation we can't give.
  const user = await getSessionUser();
  if (user) {
    const quota = await canStartCourse(user.id);
    if (!quota.ok) {
      return {
        ok: false,
        error: `You’ve started ${quota.entitlements.coursesStartedThisMonth} of ${quota.entitlements.plan.coursesPerMonth} courses this month on ${quota.entitlements.plan.name}. Upgrade on the Pricing page for more.`,
      };
    }
  }

  const result = await generateCourseFromSources(sources, focus);
  if (!result.ok) return result;

  // Saving is best-effort: never lose a freshly generated course to a DB hiccup.
  if (!user) {
    return {
      ok: true,
      course: result.course,
      savedId: null,
      saveError: "Sign out and back in to save courses to your library.",
    };
  }
  try {
    const savedId = await saveGeneratedCourse(user, result.course);
    await startCourse(user, genRef(savedId));
    revalidatePath("/library");
    // Lessons are handed out one at a time on the course page, so the browser
    // never gets the whole-course prompt here.
    const blank = { claude: "", chatgpt: "", gemini: "" };
    return { ok: true, course: { ...result.course, prompts: blank }, savedId };
  } catch (e) {
    console.error("Failed to save generated course", e);
    return {
      ok: true,
      course: result.course,
      savedId: null,
      saveError: "Couldn't save this course to your library.",
    };
  }
}

export async function deleteGeneratedCourseAction(id: string): Promise<void> {
  const user = await getSessionUser();
  if (!user || typeof id !== "string") return;
  await deleteMyCourse(user.id, id);
  revalidatePath("/library");
}

export async function updateCourseIdentityAction(
  id: string,
  update: { title?: unknown; icon?: unknown; image?: unknown },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user || typeof id !== "string") return { ok: false, error: "Please sign in again." };
  const clean = {
    title: typeof update?.title === "string" ? update.title : undefined,
    icon: typeof update?.icon === "string" ? update.icon : undefined,
    image: update?.image === null ? null : typeof update?.image === "string" ? update.image : undefined,
  };
  const error = await updateMyCourseIdentity(user.id, id, clean);
  if (error) return { ok: false, error };
  revalidatePath(`/courses/g/${id}`);
  revalidatePath("/library");
  return { ok: true };
}
