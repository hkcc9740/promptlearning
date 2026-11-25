// Server-only: the in-site AI tutor — chat history, daily limits, Gemini streaming.
import { and, asc, count, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { CourseRef } from "@/lib/enrollments";

export type ChatMessage = { role: "user" | "model"; content: string };

export const MAX_MESSAGE_CHARS = 4000;
/** Control signals appended to the tutor text stream (stripped by the client). */
export const SIGNAL = "\u001e";
const HISTORY_LIMIT = 60; // messages sent back to the model per turn

const TUTOR_MODEL = process.env.GEMINI_TUTOR_MODEL || process.env.GEMINI_MODEL || "gemini-3.5-flash";
const TUTOR_FALLBACK = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";

export async function getThread(
  userId: string,
  ref: CourseRef,
  moduleIndex: number,
): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db
    .select({ role: schema.lessonMessages.role, content: schema.lessonMessages.content })
    .from(schema.lessonMessages)
    .where(
      and(
        eq(schema.lessonMessages.userId, userId),
        eq(schema.lessonMessages.courseRef, ref),
        eq(schema.lessonMessages.moduleIndex, moduleIndex),
      ),
    )
    .orderBy(asc(schema.lessonMessages.id));
  return rows.map((r) => ({ role: r.role === "model" ? "model" : "user", content: r.content }));
}

export async function countUserMessagesSince(userId: string, since: Date): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(schema.lessonMessages)
    .where(
      and(
        eq(schema.lessonMessages.userId, userId),
        eq(schema.lessonMessages.role, "user"),
        gte(schema.lessonMessages.createdAt, since),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function saveMessages(
  userId: string,
  ref: CourseRef,
  moduleIndex: number,
  messages: ChatMessage[],
): Promise<void> {
  if (messages.length === 0) return;
  const db = await getDb();
  await db
    .insert(schema.lessonMessages)
    .values(messages.map((m) => ({ userId, courseRef: ref, moduleIndex, role: m.role, content: m.content })));
}

/**
 * Open a streaming Gemini response. Tries the main model, then a lighter one
 * if Google is busy. Returns the raw SSE Response (caller parses it).
 */
export async function openTutorStream(
  systemPrompt: string,
  history: ChatMessage[],
  signal: AbortSignal,
): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("The AI tutor isn't configured (GEMINI_API_KEY missing).");

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: history.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  });

  let last: Response | null = null;
  for (const model of [...new Set([TUTOR_MODEL, TUTOR_FALLBACK])]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body,
          signal,
        },
      );
      if (res.ok && res.body) return res;
      last = res;
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  const status = last?.status ?? 0;
  throw new Error(
    status === 429
      ? "The tutor is getting a lot of questions right now. Please try again in a minute."
      : "The tutor is busy right now. Please try again in a moment.",
  );
}

/** Pull the visible text out of one Gemini SSE `data:` payload (skipping thoughts). */
export function textFromSseData(json: string): string {
  try {
    const d = JSON.parse(json) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    return (d.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
  } catch {
    return "";
  }
}
