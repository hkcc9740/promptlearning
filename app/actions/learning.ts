"use server";

import { revalidatePath } from "next/cache";
import { loadCourse } from "@/lib/course-ref";
import { completeLesson, parseCourseRef, startCourse, type CourseRef } from "@/lib/enrollments";
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
