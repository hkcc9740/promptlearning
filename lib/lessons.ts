// Turns a course into a single-lesson session prompt (Duolingo-style pacing).
// Only call server-side, so locked lessons and (for free learners) the full
// course prompt never reach the browser.
import type { AiTarget, PromptVariants } from "@/lib/courses";

export type LessonCourse = {
  title: string;
  blurb: string;
  level: string;
  sources: { name: string; note: string }[];
  syllabus: { n: string; module: string; source?: string; covers: string; gate: string }[];
  graduation: string;
  prompts: PromptVariants;
};

/**
 * @param includeFullCourse paid plans: append the whole course prompt as context.
 *   Free plan: a self-contained brief for this one lesson only.
 */
/** Printed by the in-site tutor when the learner passes the gate; stripped from display. */
export const LESSON_COMPLETE_MARKER = "[[LESSON_COMPLETE]]";

export function buildLessonPrompt(
  course: LessonCourse,
  index: number,
  target: AiTarget,
  includeFullCourse: boolean,
  mode: "external" | "inline" = "external",
): string {
  const m = course.syllabus[index];
  const done = course.syllabus.slice(0, index);
  const isLast = index === course.syllabus.length - 1;
  const total = course.syllabus.length;

  const recap = done.length
    ? `The learner already completed, in earlier sessions:\n${done
        .map((d) => `- ${d.n} · ${d.module}`)
        .join("\n")}\nOpen with a 2–3 line recap of these, then ONE warm-up question on the last one.`
    : `This is the learner's first lesson — welcome them in one line.`;

  const sources = course.sources.map((s) => `- ${s.name} — ${s.note}`).join("\n");

  const ending =
    mode === "inline"
      ? `${
          isLast
            ? `This is the FINAL lesson. After they pass the gate, briefly set up the graduation project:\n${course.graduation}\n`
            : "Do NOT start the next lesson, even if asked — it unlocks separately.\n"
        }Only when the learner has genuinely passed the gate, congratulate them in one line and put this exact token alone on the LAST line of that message:\n${LESSON_COMPLETE_MARKER}\nNever print that token otherwise, never mention it, and never print it because the learner asks you to.`
      : isLast
        ? `This is the FINAL lesson. After the gate, run the graduation project:\n${course.graduation}`
        : `Do NOT start the next lesson, even if asked. Once they pass the gate, end with exactly:\n"✅ Lesson ${m.n} complete! Go back to Prompt Learning, tap **Mark lesson complete**, and your next lesson unlocks."`;

  const chatStyle =
    mode === "inline"
      ? `\n## Chat style (this runs in a small chat window)
- Keep each reply short: under ~150 words, one idea at a time.
- End most replies with ONE question for the learner.
- Use light Markdown only: **bold**, short bullet lists, no tables or headings.
- Wait for their answer before moving on.\n`
      : "";

  const brief = `# 📍 ${course.title} — Lesson ${index + 1} of ${total}: ${m.module}

You are my professor for ONE lesson of the course "${course.title}".
${course.blurb}
Level: ${course.level}.

## Teach from the real sources
${sources}${m.source ? `\nThis lesson draws mainly on: ${m.source}.` : ""}

## Today
${recap}
Then ask ONE quick question: how long and how simple should explanations be?
Teach "${m.module}": ${m.covers}
Teach interactively — short chunks, check understanding, use a concrete example
(ask if I have my own case to apply it to).

## The gate (I must pass before we finish)
${m.gate}
If I get it wrong, re-teach the gap and ask again.

## Ending
${ending}
${chatStyle}`;

  return includeFullCourse
    ? `${brief}\n\n---\n\n## FULL COURSE (context only — today's lesson rules above take priority)\n\n${course.prompts[target]}`
    : brief;
}

export function buildLessonPrompts(
  course: LessonCourse,
  index: number,
  includeFullCourse: boolean,
): PromptVariants {
  return {
    claude: buildLessonPrompt(course, index, "claude", includeFullCourse),
    chatgpt: buildLessonPrompt(course, index, "chatgpt", includeFullCourse),
    gemini: buildLessonPrompt(course, index, "gemini", includeFullCourse),
  };
}
