import { loadCourse } from "@/lib/course-ref";
import { getEntitlements } from "@/lib/entitlements";
import { completeLesson, currentLesson, getProgress, parseCourseRef } from "@/lib/enrollments";
import { buildLessonPrompt, LESSON_COMPLETE_MARKER } from "@/lib/lessons";
import { getSessionUser } from "@/lib/session";
import {
  countUserMessagesSince,
  getThread,
  MAX_MESSAGE_CHARS,
  openTutorStream,
  saveMessages,
  SIGNAL,
  textFromSseData,
  type ChatMessage,
} from "@/lib/tutor";

// A tutor reply streams for up to a minute or so.
export const maxDuration = 120;


const KICKOFF = "Hi! I'm ready to start this lesson.";

function fail(error: string, status = 400) {
  return Response.json({ error }, { status });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Please sign in again.", 401);

  let body: { courseRef?: unknown; moduleIndex?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Bad request.");
  }

  const ref = parseCourseRef(body.courseRef);
  const moduleIndex = Number(body.moduleIndex);
  if (!ref || !Number.isInteger(moduleIndex)) return fail("Bad request.");

  const loaded = await loadCourse(user.id, ref);
  if (!loaded) return fail("Course not found.", 404);
  const { course } = loaded;

  // Only the learner's current, unlocked lesson can be chatted with.
  const [progress, ent] = await Promise.all([getProgress(user.id, ref), getEntitlements(user.id)]);
  if (!progress.enrolled) return fail("Start the course first.", 403);
  if (currentLesson(progress, course.syllabus.length) !== moduleIndex) {
    return fail("That isn’t your current lesson. Refresh the page.", 409);
  }
  if (ent.lessonsLeftToday !== null && ent.lessonsLeftToday <= 0) {
    return fail("That’s today’s lesson done! The next one unlocks tomorrow.", 429);
  }

  // Daily message allowance (each message is an AI call on the site's key).
  const limit = ent.plan.tutorMessagesPerDay;
  if (limit !== null && (await countUserMessagesSince(user.id, ent.dayStartsAt)) >= limit) {
    return fail(
      `You’ve sent ${limit} tutor messages today on ${ent.plan.name}. More tomorrow, or upgrade for a higher limit.`,
      429,
    );
  }

  const thread = await getThread(user.id, ref, moduleIndex);
  let text = typeof body.message === "string" ? body.message.trim() : "";
  if (!text && thread.length === 0) text = KICKOFF;
  if (!text) return fail("Type a message first.");
  if (text.length > MAX_MESSAGE_CHARS) return fail(`Keep messages under ${MAX_MESSAGE_CHARS} characters.`);

  const userMsg: ChatMessage = { role: "user", content: text };
  await saveMessages(user.id, ref, moduleIndex, [userMsg]);

  const system = buildLessonPrompt(course, moduleIndex, "gemini", ent.plan.wholeCoursePrompt, "inline");

  let upstream: Response;
  try {
    upstream = await openTutorStream(system, [...thread, userMsg], req.signal);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The tutor is unavailable right now.", 503);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const hold = LESSON_COMPLETE_MARKER.length; // never emit a half-printed marker

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      let sent = 0;
      let sse = "";
      const reader = upstream.body!.getReader();

      const flush = (final: boolean) => {
        const visible = full.split(LESSON_COMPLETE_MARKER).join("");
        const upTo = final ? visible.length : Math.max(sent, visible.length - hold);
        if (upTo > sent) {
          controller.enqueue(encoder.encode(visible.slice(sent, upTo)));
          sent = upTo;
        }
        return visible;
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          sse += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = sse.indexOf("\n")) >= 0) {
            const line = sse.slice(0, nl).trim();
            sse = sse.slice(nl + 1);
            if (line.startsWith("data:")) full += textFromSseData(line.slice(5).trim());
          }
          flush(false);
        }

        const visible = flush(true).trim();
        const passed = full.includes(LESSON_COMPLETE_MARKER);
        if (visible) await saveMessages(user.id, ref, moduleIndex, [{ role: "model", content: visible }]);
        if (passed) {
          const res = await completeLesson(user.id, ref, moduleIndex, course.syllabus.length);
          if (res.ok) controller.enqueue(encoder.encode(`${SIGNAL}LESSON_COMPLETE`));
        }
      } catch (e) {
        if (!req.signal.aborted) {
          console.error("Tutor stream failed", e);
          controller.enqueue(encoder.encode(`${SIGNAL}ERROR:The tutor got cut off. Please send that again.`));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
