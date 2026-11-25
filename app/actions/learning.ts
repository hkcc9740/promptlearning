"use server";

import { revalidatePath } from "next/cache";
import { loadCourse } from "@/lib/course-ref";
import { getOrCreateBites } from "@/lib/bites";
import { getEntitlements } from "@/lib/entitlements";
import {
  completeLesson,
  currentLesson,
  getBiteStep,
  getProgress,
  parseCourseRef,
  saveBiteStep,
  startCourse,
  type CourseRef,
} from "@/lib/enrollments";
import { getSessionUser } from "@/lib/session";

export type LearningResult = { ok: true } | { ok: false; error: string };

/** Resolve a course ref to its page path + module count (and check access). */
async function resolve(userId: string, ref: CourseRef) {
  const loaded = await loadCourse(userId, ref);
  return loaded ? { path: loaded.path, modules: loaded.course.syllabus.length } : null;
}

export async function startCourseAction(rawRef: string): Promise<LearningResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Please sign in (or sign out and back in) to start a course." };
  const ref = parseCourseRef(rawRef);
  const target = ref && (await resolve(user.id, ref));
  if (!ref || !target) return { ok: false, error: "Course not found." };

  const res = await startCourse(user, ref);
  if (!res.ok) {
    return { ok: false, error: "You’ve used this month’s courses. Upgrade for more, or wait for next month." };
  }
  revalidatePath(target.path);
  return { ok: true };
}

export async function completeLessonAction(rawRef: string, moduleIndex: number): Promise<LearningResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const ref = parseCourseRef(rawRef);
  const target = ref && (await resolve(user.id, ref));
  if (!ref || !target) return { ok: false, error: "Course not found." };

  const res = await completeLesson(user.id, ref, moduleIndex, target.modules);
  if (!res.ok) {
    const msg = {
      not_enrolled: "Start the course first.",
      out_of_order: "That lesson isn’t your current one — refresh the page.",
      daily_limit: "That’s today’s lesson done! The next one unlocks tomorrow.",
      bad_module: "Unknown lesson.",
    }[res.reason];
    return { ok: false, error: msg };
  }
  revalidatePath(target.path);
  return { ok: true };
}

export type BitesResult =
  | { ok: true; bites: import("@/lib/bites").Bite[]; resumeStep: number }
  | { ok: false; error: string };

/** The bites for the learner's current, unlocked lesson (generated once, then cached). */
export async function getLessonBitesAction(rawRef: string, moduleIndex: number): Promise<BitesResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Please sign in again." };
  const ref = parseCourseRef(rawRef);
  const loaded = ref && (await loadCourse(user.id, ref));
  if (!ref || !loaded) return { ok: false, error: "Course not found." };

  const [progress, ent] = await Promise.all([getProgress(user.id, ref), getEntitlements(user.id)]);
  if (!progress.enrolled) return { ok: false, error: "Start the course first." };
  if (currentLesson(progress, loaded.course.syllabus.length) !== moduleIndex) {
    return { ok: false, error: "That isn’t your current lesson. Refresh the page." };
  }
  if (ent.lessonsLeftToday !== null && ent.lessonsLeftToday <= 0) {
    return { ok: false, error: "That’s today’s lesson done! The next one unlocks tomorrow." };
  }

  try {
    const [{ bites }, saved] = await Promise.all([
      getOrCreateBites(ref, loaded.course, moduleIndex),
      getBiteStep(user.id, ref, moduleIndex),
    ]);
    return { ok: true, bites, resumeStep: Math.min(Math.max(0, saved), bites.length - 1) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t prepare this lesson." };
  }
}

/** Save the learner's place in the current lesson (called as they move bite to bite). */
export async function saveBiteProgressAction(rawRef: string, moduleIndex: number, step: number): Promise<void> {
  const user = await getSessionUser();
  const ref = parseCourseRef(rawRef);
  if (!user || !ref) return;
  await saveBiteStep(user.id, ref, moduleIndex, step);
}
