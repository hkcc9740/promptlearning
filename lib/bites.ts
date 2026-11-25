// Server-only: turn one syllabus module into 3–5 bite-sized, quiz-checked steps.
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { CourseRef } from "@/lib/enrollments";
import { generateStructured } from "@/lib/generate";
import type { LessonCourse } from "@/lib/lessons";

export type BiteOption = { text: string; why: string };
export type Bite = {
  title: string;
  explain: string;
  question: string;
  hint: string;
  options: BiteOption[];
  correct: number; // index into options
};
export type LessonBites = { bites: Bite[] };

const bitesSchema = {
  type: "OBJECT",
  properties: {
    bites: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          explain: { type: "STRING" },
          question: { type: "STRING" },
          hint: { type: "STRING" },
          options: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { text: { type: "STRING" }, why: { type: "STRING" } },
              required: ["text", "why"],
            },
          },
          correct: { type: "INTEGER" },
        },
        required: ["title", "explain", "question", "hint", "options", "correct"],
      },
    },
  },
  required: ["bites"],
};

function buildPrompt(course: LessonCourse, index: number): string {
  const m = course.syllabus[index];
  const sources = course.sources.map((s) => `- ${s.name}: ${s.note}`).join("\n");
  return `You write bite-sized interactive lessons (like Duolingo or Brilliant) for the course
"${course.title}" — ${course.blurb} Level: ${course.level}.

Sources to teach from (attribute ideas to them, never invent citations):
${sources}

THIS LESSON: module ${m.n} — "${m.module}"${m.source ? ` (mainly from ${m.source})` : ""}
What it covers: ${m.covers}
The lesson's final check (gate): ${m.gate}

Write 4 bites (3 if the topic is small, 5 if it's big). Each bite teaches ONE idea:
- "title": 2–6 words, the idea's name (e.g. "Update the Love Map").
- "explain": 1–3 plain sentences that teach the idea. No fluff, no jargon left unexplained.
- "question": a realistic mini-scenario with named people (e.g. Alex and Maya) that tests
  APPLYING the idea, not recalling a definition. One or two sentences.
- "hint": one gentle nudge sentence that helps without giving the answer away.
- "options": exactly 4. One clearly best answer; three plausible but wrong ones
  (common mistakes). Each option is short (under ~15 words). Quote spoken lines in “ ”.
  "why": one sentence explaining why THAT option is right or wrong.
- "correct": the 0-based index of the best option.
Bites build on each other. The LAST bite must be the lesson's gate, turned into a
scenario multiple-choice question.

Return only JSON matching the schema.`;
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Validate the model's output and shuffle options so the answer isn't always "B". */
function clean(raw: Record<string, unknown>): LessonBites | null {
  const list = Array.isArray(raw.bites) ? raw.bites : [];
  const bites: Bite[] = [];
  for (const b of list.slice(0, 6)) {
    const o = (b ?? {}) as Record<string, unknown>;
    const opts = (Array.isArray(o.options) ? o.options : [])
      .map((x) => ({ text: str((x as BiteOption)?.text, 200), why: str((x as BiteOption)?.why, 300) }))
      .filter((x) => x.text);
    const correct = Number(o.correct);
    if (opts.length < 2 || !Number.isInteger(correct) || correct < 0 || correct >= opts.length) continue;
    const tagged = opts.slice(0, 4).map((x, i) => ({ ...x, isRight: i === correct }));
    if (!tagged.some((t) => t.isRight)) continue;
    const mixed = shuffle(tagged);
    const title = str(o.title, 120);
    const question = str(o.question, 500);
    if (!title || !question) continue;
    bites.push({
      title,
      explain: str(o.explain, 800),
      question,
      hint: str(o.hint, 300),
      options: mixed.map(({ text, why }) => ({ text, why })),
      correct: mixed.findIndex((t) => t.isRight),
    });
  }
  return bites.length >= 2 ? { bites } : null;
}

/** Cached bites for a lesson, generating (once) if needed. */
export async function getOrCreateBites(
  ref: CourseRef,
  course: LessonCourse,
  moduleIndex: number,
): Promise<LessonBites> {
  const db = await getDb();
  const [cached] = await db
    .select({ data: schema.lessonContent.data })
    .from(schema.lessonContent)
    .where(and(eq(schema.lessonContent.courseRef, ref), eq(schema.lessonContent.moduleIndex, moduleIndex)))
    .limit(1);
  if (cached) return cached.data as LessonBites;

  let lesson: LessonBites | null = null;
  for (let attempt = 0; attempt < 2 && !lesson; attempt++) {
    lesson = clean(await generateStructured(buildPrompt(course, moduleIndex), bitesSchema));
  }
  if (!lesson) throw new Error("Couldn’t prepare this lesson. Please try again.");

  await db
    .insert(schema.lessonContent)
    .values({ courseRef: ref, moduleIndex, data: lesson })
    .onConflictDoNothing();
  return lesson;
}
