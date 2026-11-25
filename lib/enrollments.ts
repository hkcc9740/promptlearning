// Server-only: starting courses (monthly quota) and completing lessons (daily pacing).
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getEntitlements, type Entitlements } from "@/lib/entitlements";
import { ensureUser, type SessionUser } from "@/lib/session";

/** "static:<slug>" for catalog courses, "gen:<id>" for generated ones. */
export type CourseRef = `static:${string}` | `gen:${string}`;

export const staticRef = (slug: string): CourseRef => `static:${slug}`;
export const genRef = (id: string): CourseRef => `gen:${id}`;

export function parseCourseRef(ref: unknown): CourseRef | null {
  return typeof ref === "string" && /^(static:[a-z0-9-]{1,80}|gen:[A-Za-z0-9_-]{12})$/.test(ref)
    ? (ref as CourseRef)
    : null;
}

export type Progress = {
  enrolled: boolean;
  completed: number[]; // module indexes, ascending
};

export async function getProgress(userId: string, ref: CourseRef): Promise<Progress> {
  const db = await getDb();
  const [[enrollment], rows] = await Promise.all([
    db
      .select()
      .from(schema.enrollments)
      .where(and(eq(schema.enrollments.userId, userId), eq(schema.enrollments.courseRef, ref)))
      .limit(1),
    db
      .select({ i: schema.lessonCompletions.moduleIndex })
      .from(schema.lessonCompletions)
      .where(
        and(eq(schema.lessonCompletions.userId, userId), eq(schema.lessonCompletions.courseRef, ref)),
      )
      .orderBy(asc(schema.lessonCompletions.moduleIndex)),
  ]);
  return { enrolled: !!enrollment, completed: rows.map((r) => r.i) };
}

export type StartResult =
  | { ok: true; alreadyEnrolled: boolean }
  | { ok: false; reason: "quota"; entitlements: Entitlements };

/** Check (without writing) whether the learner may start one more course. */
export async function canStartCourse(userId: string): Promise<{ ok: boolean; entitlements: Entitlements }> {
  const ent = await getEntitlements(userId);
  return { ok: ent.coursesLeftThisMonth === null || ent.coursesLeftThisMonth > 0, entitlements: ent };
}

/** Enroll, consuming one course from this month's quota. Idempotent per course. */
export async function startCourse(user: SessionUser, ref: CourseRef): Promise<StartResult> {
  await ensureUser(user);
  const progress = await getProgress(user.id, ref);
  if (progress.enrolled) return { ok: true, alreadyEnrolled: true };

  const { ok, entitlements } = await canStartCourse(user.id);
  if (!ok) return { ok: false, reason: "quota", entitlements };

  const db = await getDb();
  await db.insert(schema.enrollments).values({ userId: user.id, courseRef: ref }).onConflictDoNothing();
  return { ok: true, alreadyEnrolled: false };
}

export type CompleteResult =
  | { ok: true }
  | { ok: false; reason: "not_enrolled" | "out_of_order" | "daily_limit" | "bad_module" };

/**
 * Mark the learner's CURRENT lesson complete. Lessons go in order, and free
 * learners can only finish `lessonsPerDay` per UTC day.
 */
export async function completeLesson(
  userId: string,
  ref: CourseRef,
  moduleIndex: number,
  moduleCount: number,
): Promise<CompleteResult> {
  if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex >= moduleCount) {
    return { ok: false, reason: "bad_module" };
  }
  const progress = await getProgress(userId, ref);
  if (!progress.enrolled) return { ok: false, reason: "not_enrolled" };
  if (currentLesson(progress, moduleCount) !== moduleIndex) return { ok: false, reason: "out_of_order" };

  const ent = await getEntitlements(userId);
  if (ent.lessonsLeftToday !== null && ent.lessonsLeftToday <= 0) {
    return { ok: false, reason: "daily_limit" };
  }

  const db = await getDb();
  await db
    .insert(schema.lessonCompletions)
    .values({ userId, courseRef: ref, moduleIndex })
    .onConflictDoNothing();
  await db
    .update(schema.enrollments)
    .set({ biteModule: null, biteStep: 0 })
    .where(and(eq(schema.enrollments.userId, userId), eq(schema.enrollments.courseRef, ref)));
  return { ok: true };
}

/** The first not-yet-completed module, or null when the course is finished. */
export function currentLesson(progress: Progress, moduleCount: number): number | null {
  const done = new Set(progress.completed);
  for (let i = 0; i < moduleCount; i++) if (!done.has(i)) return i;
  return null;
}

/** Remember which bite the learner reached in their current lesson. */
export async function saveBiteStep(
  userId: string,
  ref: CourseRef,
  moduleIndex: number,
  step: number,
): Promise<void> {
  if (!Number.isInteger(moduleIndex) || !Number.isInteger(step) || step < 0 || step > 20) return;
  const db = await getDb();
  await db
    .update(schema.enrollments)
    .set({ biteModule: moduleIndex, biteStep: step })
    .where(and(eq(schema.enrollments.userId, userId), eq(schema.enrollments.courseRef, ref)));
}

/** The saved bite for this lesson, or 0 if none / it was for another lesson. */
export async function getBiteStep(userId: string, ref: CourseRef, moduleIndex: number): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ m: schema.enrollments.biteModule, s: schema.enrollments.biteStep })
    .from(schema.enrollments)
    .where(and(eq(schema.enrollments.userId, userId), eq(schema.enrollments.courseRef, ref)))
    .limit(1);
  return row && row.m === moduleIndex ? row.s : 0;
}
