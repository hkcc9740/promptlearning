// Server-only: a learner's saved (generated) courses.
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { GeneratedCourseRow } from "@/lib/db/schema";
import type { GeneratedCourse } from "@/lib/generate";
import { ensureUser, type SessionUser } from "@/lib/session";

export type LibraryItem = {
  id: string;
  title: string;
  icon: string;
  category: string;
  imageUrl: string | null;
  course: GeneratedCourse;
  createdAt: Date;
};

const ID_RE = /^[A-Za-z0-9_-]{12}$/;

function newId(): string {
  return randomBytes(9).toString("base64url"); // 12 url-safe chars
}

export async function saveGeneratedCourse(
  user: SessionUser,
  course: GeneratedCourse,
): Promise<string> {
  await ensureUser(user);
  const db = await getDb();
  const id = newId();
  await db.insert(schema.generatedCourses).values({
    id,
    ownerId: user.id,
    title: course.title,
    icon: course.icon,
    category: course.category,
    sourceUrl: course.sourceUrl,
    data: course,
  });
  return id;
}

function toItem(row: GeneratedCourseRow): LibraryItem {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    category: row.category,
    imageUrl: row.imageData ?? null,
    // The editable title/icon columns are the source of truth.
    course: { ...row.data, title: row.title, icon: row.icon },
    createdAt: row.createdAt,
  };
}

export async function listMyCourses(userId: string): Promise<LibraryItem[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.generatedCourses)
    .where(eq(schema.generatedCourses.ownerId, userId))
    .orderBy(desc(schema.generatedCourses.createdAt));
  return rows.map(toItem);
}

/** Only the owner can read a generated course (sharing comes later). */
export async function getMyCourse(userId: string, id: string): Promise<LibraryItem | null> {
  if (!ID_RE.test(id)) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.generatedCourses)
    .where(
      and(eq(schema.generatedCourses.id, id), eq(schema.generatedCourses.ownerId, userId)),
    )
    .limit(1);
  return row ? toItem(row) : null;
}

export async function deleteMyCourse(userId: string, id: string): Promise<void> {
  if (!ID_RE.test(id)) return;
  const db = await getDb();
  await db
    .delete(schema.generatedCourses)
    .where(
      and(eq(schema.generatedCourses.id, id), eq(schema.generatedCourses.ownerId, userId)),
    );
}

export type IdentityUpdate = { title?: string; icon?: string; image?: string | null };

const IMAGE_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;
export const MAX_IMAGE_DATA_URL = 480_000; // ~350 KB of image

/** Rename / change emoji / set or clear the cover image. Returns an error message or null. */
export async function updateMyCourseIdentity(
  userId: string,
  id: string,
  update: IdentityUpdate,
): Promise<string | null> {
  if (!ID_RE.test(id)) return "Course not found.";
  const set: Partial<typeof schema.generatedCourses.$inferInsert> = {};

  if (update.title !== undefined) {
    const title = update.title.replace(/\s+/g, " ").trim();
    if (!title) return "The course needs a name.";
    if (title.length > 120) return "Keep the name under 120 characters.";
    set.title = title;
  }
  if (update.icon !== undefined) {
    const icon = update.icon.trim();
    // One emoji (possibly multi-codepoint, e.g. flags / skin tones / ZWJ sequences).
    const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(icon)];
    if (graphemes.length !== 1 || !/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(icon)) {
      return "Pick a single emoji.";
    }
    set.icon = icon;
  }
  if (update.image !== undefined) {
    if (update.image === null) set.imageData = null;
    else if (update.image.length > MAX_IMAGE_DATA_URL || !IMAGE_RE.test(update.image)) {
      return "That image couldn't be used. Try a smaller PNG, JPEG or WebP.";
    } else set.imageData = update.image;
  }
  if (Object.keys(set).length === 0) return null;

  const db = await getDb();
  const updated = await db
    .update(schema.generatedCourses)
    .set(set)
    .where(and(eq(schema.generatedCourses.id, id), eq(schema.generatedCourses.ownerId, userId)))
    .returning({ id: schema.generatedCourses.id });
  return updated.length ? null : "Course not found.";
}
