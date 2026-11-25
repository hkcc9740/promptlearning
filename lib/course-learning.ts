// Server-only: compute what the course sidebar shows (start / lesson / locked / done).
import type { PromptVariants } from "@/lib/courses";
import { getEntitlements } from "@/lib/entitlements";
import { currentLesson, getProgress, type CourseRef } from "@/lib/enrollments";
import { buildLessonPrompts, type LessonCourse } from "@/lib/lessons";
import { countUserMessagesSince, getThread, type ChatMessage } from "@/lib/tutor";
import { ensureUser, type SessionUser } from "@/lib/session";

export type LearningState =
  | { kind: "signedOut"; signInHref: string; teaser: PromptVariants }
  | {
      kind: "notStarted";
      teaser: PromptVariants;
      planName: string;
      coursesLeft: number | null;
      coursesPerMonth: number | null;
      monthResetsAt: string;
    }
  | {
      kind: "learning";
      planName: string;
      completed: number[];
      current: number | null; // null = finished
      /** Today's lesson prompt; null when locked by the daily limit. */
      lesson: PromptVariants | null;
      lessonsPerDay: number | null;
      lessonsLeftToday: number | null;
      dayResetsAt: string;
      /** Whole-course prompt — paid plans only. */
      full: PromptVariants | null;
      /** In-site tutor chat for the current lesson (null when finished/locked). */
      chat: null | {
        moduleIndex: number;
        messages: ChatMessage[];
        messagesLeftToday: number | null;
      };
    };

export function teaserOf(prompts: PromptVariants): PromptVariants {
  const t = (p: string) => p.split("\n").slice(0, 9).join("\n") + "\n…";
  return { claude: t(prompts.claude), chatgpt: t(prompts.chatgpt), gemini: t(prompts.gemini) };
}

export async function getLearningState(
  user: SessionUser | null,
  ref: CourseRef,
  course: LessonCourse,
  signInHref: string,
): Promise<LearningState> {
  const teaser = teaserOf(course.prompts);
  if (!user) return { kind: "signedOut", signInHref, teaser };

  await ensureUser(user);
  const [ent, progress] = await Promise.all([getEntitlements(user.id), getProgress(user.id, ref)]);

  if (!progress.enrolled) {
    return {
      kind: "notStarted",
      teaser,
      planName: ent.plan.name,
      coursesLeft: ent.coursesLeftThisMonth,
      coursesPerMonth: ent.plan.coursesPerMonth,
      monthResetsAt: ent.monthResetsAt.toISOString(),
    };
  }

  const current = currentLesson(progress, course.syllabus.length);
  const locked = ent.lessonsLeftToday !== null && ent.lessonsLeftToday <= 0;

  let chat: Extract<LearningState, { kind: "learning" }>["chat"] = null;
  if (current !== null && !locked) {
    const [messages, sentToday] = await Promise.all([
      getThread(user.id, ref, current),
      ent.plan.tutorMessagesPerDay === null ? Promise.resolve(0) : countUserMessagesSince(user.id, ent.dayStartsAt),
    ]);
    chat = {
      moduleIndex: current,
      messages,
      messagesLeftToday:
        ent.plan.tutorMessagesPerDay === null ? null : Math.max(0, ent.plan.tutorMessagesPerDay - sentToday),
    };
  }

  return {
    kind: "learning",
    planName: ent.plan.name,
    completed: progress.completed,
    current,
    lesson:
      current !== null && !locked
        ? buildLessonPrompts(course, current, ent.plan.wholeCoursePrompt)
        : null,
    lessonsPerDay: ent.plan.lessonsPerDay,
    lessonsLeftToday: ent.lessonsLeftToday,
    dayResetsAt: ent.dayResetsAt.toISOString(),
    full: ent.plan.wholeCoursePrompt ? course.prompts : null,
    chat,
  };
}
