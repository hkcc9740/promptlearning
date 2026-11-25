// Server-only: this module reads GEMINI_API_KEY and makes outbound fetches.
// It must only ever be imported from Server Actions / Route Handlers / Server
// Components — never from a "use client" module.
import type { NotionColor } from "@/components/notion-tag";
import type { PromptVariants } from "@/lib/courses";
import { groupOf, MAX_PDF_BYTES, type ShelfSource, type SourceKind } from "@/lib/sources/kinds";

/* ------------------------------------------------------------------ */
/*  Types — a generated course is a lighter, un-persisted Course.       */
/* ------------------------------------------------------------------ */

export type GenSource = { name: string; note: string };

export type GenSyllabusItem = {
  n: string; // "00", "01", …
  module: string;
  source?: string;
  covers: string;
  gate: string;
};

export type GeneratedCourse = {
  title: string;
  icon: string; // single emoji
  color: NotionColor;
  kicker: string;
  category: string;
  oneLiner: string;
  blurb: string;
  duration: string;
  level: string;
  outcomes: string[];
  sources: GenSource[];
  syllabus: GenSyllabusItem[];
  graduation: string;
  prompts: PromptVariants;
  sourceUrl: string;
  sourceTitle: string;
  /** What the learner gave us to build this course from (shelf items). */
  builtFrom?: { kind: SourceKind; title: string; subtitle?: string; url?: string }[];
};

export type GenResult =
  | { ok: true; course: GeneratedCourse }
  | { ok: false; error: string };

const NOTION_COLORS: NotionColor[] = [
  "green",
  "blue",
  "orange",
  "purple",
  "yellow",
  "pink",
  "gray",
];

// gemini-2.5-flash is closed to new API keys (Nov 2026). Override with GEMINI_MODEL.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";

/* ------------------------------------------------------------------ */
/*  URL safety — only fetch public http(s) course pages.               */
/* ------------------------------------------------------------------ */

export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  const host = u.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) return null;
  if (!host.includes(".")) return null; // need a real TLD

  return u.toString();
}

/* ------------------------------------------------------------------ */
/*  Fetch + reduce a page to readable text.                            */
/* ------------------------------------------------------------------ */

export type PageContent = { title: string; text: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function htmlToContent(html: string): PageContent {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  );
  const ogDescMatch = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  );

  const title = decodeEntities((titleMatch?.[1] ?? "").trim());
  const metaDesc = decodeEntities(
    (descMatch?.[1] ?? ogDescMatch?.[1] ?? "").trim(),
  );

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const text = decodeEntities(body).replace(/\s+/g, " ").trim();

  const combined = [title, metaDesc, text].filter(Boolean).join("\n\n");
  return { title, text: combined.slice(0, 12000) };
}

export async function fetchPage(url: string): Promise<PageContent | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("html") && !ctype.includes("text")) return null;
    const html = await res.text();
    return htmlToContent(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/* ------------------------------------------------------------------ */
/*  Gemini — structured course generation.                             */
/* ------------------------------------------------------------------ */

const promptSchema = {
  type: "OBJECT",
  properties: {
    claude: { type: "STRING" },
    chatgpt: { type: "STRING" },
    gemini: { type: "STRING" },
  },
  required: ["claude", "chatgpt", "gemini"],
};

const courseSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    icon: { type: "STRING" },
    color: { type: "STRING", enum: NOTION_COLORS },
    kicker: { type: "STRING" },
    category: { type: "STRING" },
    oneLiner: { type: "STRING" },
    blurb: { type: "STRING" },
    duration: { type: "STRING" },
    level: { type: "STRING" },
    outcomes: { type: "ARRAY", items: { type: "STRING" } },
    sources: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          note: { type: "STRING" },
        },
        required: ["name", "note"],
      },
    },
    syllabus: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          n: { type: "STRING" },
          module: { type: "STRING" },
          source: { type: "STRING" },
          covers: { type: "STRING" },
          gate: { type: "STRING" },
        },
        required: ["n", "module", "covers", "gate"],
      },
    },
    graduation: { type: "STRING" },
    prompts: promptSchema,
  },
  required: [
    "title",
    "icon",
    "color",
    "kicker",
    "category",
    "oneLiner",
    "blurb",
    "duration",
    "level",
    "outcomes",
    "sources",
    "syllabus",
    "graduation",
    "prompts",
  ],
};

function describeSource(src: ShelfSource, i: number): string {
  const tag = `[S${i + 1}] ${groupOf(src.kind).label.replace(/s$/, "").toUpperCase()}: ${src.title}`;
  const lines = [tag];
  if (src.subtitle) lines.push(`(${src.subtitle})`);
  if (src.url) lines.push(`Link: ${src.url}`);
  if (src.book) {
    lines.push(
      `Book by ${src.book.authors.join(", ") || "unknown author"}${src.book.year ? `, ${src.book.year}` : ""}.`,
      src.book.subjects?.length ? `Subjects: ${src.book.subjects.join(", ")}.` : "",
      "Teach its key ideas from your knowledge of this book; attribute them to it.",
    );
  }
  if (src.kind === "video") lines.push("The video itself is attached — watch it.");
  if (src.file || (src.kind === "paper" && src.url && /\.pdf($|\?)/i.test(src.url))) {
    lines.push("The document itself is attached — read it.");
  }
  if (src.text) lines.push(`CONTENT (extracted, may be noisy/truncated):\n${src.text}`);
  if (src.quality === "partial" && !src.text) {
    lines.push("We could only get the title — use your own knowledge of this source/topic.");
  }
  return lines.filter(Boolean).join("\n");
}

function buildInstruction(sources: ShelfSource[], focus: string): string {
  const many = sources.length > 1;
  return `You are the curriculum designer for "Prompt Learning", a site that turns any
material into a self-running, interactive course a learner pastes into an AI chat
(Claude, ChatGPT, or Gemini). The learner gave us ${many ? `${sources.length} sources` : "this source"}:

${sources.map(describeSource).join("\n\n---\n\n")}
${focus ? `\nTHE LEARNER'S FOCUS: "${focus}". Shape the course around this goal.\n` : ""}
Design ONE Prompt-Learning course that teaches the SUBJECT of ${many ? "these sources, synthesized into a single coherent path (not one module per source unless that's the best structure)" : "this source"} —
not a summary, but a real course, grounded in the learner's sources first and
then the best teachers and primary works on the topic.

Rules:
- "title": a clear, appealing course name (not just the source's title).
- "icon": exactly one emoji that best fits the subject.
- "color": one of ${NOTION_COLORS.join(", ")} that matches the vibe.
- "kicker": 1–3 word category label (e.g. "finance", "AI agents").
- "oneLiner": one punchy sentence for a catalog card.
- "blurb": 1–2 sentences, who it's for and what they'll be able to do.
- "duration": e.g. "~3 hours, self-paced". "level": e.g. "Beginner → Intermediate".
- "outcomes": 4–6 concrete things the learner will be able to DO afterward.
- "sources": 2–5 real sources (name + one-line note). ALWAYS include the learner's
  own sources (use their real titles/authors); you may add 1–2 reputable extras.
  Never invent fake citations.
- "syllabus": 5–8 modules. "n" is a zero-padded marker "00","01",… "module" is
  the title. "source" names which of the learner's sources (by title) or which
  expert the module draws on. "covers" is 1–2 sentences. "gate" is a short check
  question the learner must answer correctly before moving on.
- "graduation": the final real-world project + a share-ready one-pager they keep.
- "prompts": for EACH of claude, chatgpt, gemini, a COMPLETE, self-contained
  system prompt the learner pastes into that AI so it runs this entire course
  interactively — professor persona, teach module by module using the syllabus,
  adapt to the learner's level, enforce the gates, end with the graduation
  project. Make it long and genuinely usable (not a stub). "claude" is the reference.

Return ONLY the JSON object matching the schema.`;
}

function coerceColor(c: unknown): NotionColor {
  return typeof c === "string" && (NOTION_COLORS as string[]).includes(c)
    ? (c as NotionColor)
    : "blue";
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

type GeminiPart =
  | { text: string }
  | { fileData: { fileUri: string; mimeType?: string } }
  | { inlineData: { data: string; mimeType: string } };

class GeminiHttpError extends Error {
  constructor(public status: number, detail: string) {
    super(`Gemini request failed (${status}). ${detail.slice(0, 200)}`);
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGeminiOnce(
  model: string,
  apiKey: string,
  parts: GeminiPart[],
  hasVideo: boolean,
  schema: object = courseSchema,
): Promise<Record<string, unknown>> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 110000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          // Long videos are token-heavy; low resolution is plenty for teaching content.
          ...(hasVideo ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {}),
          temperature: 0.65,
          maxOutputTokens: 32768, // thinking models count reasoning tokens here too
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    });

    if (!res.ok) throw new GeminiHttpError(res.status, await res.text().catch(() => ""));

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      promptFeedback?: { blockReason?: string };
    };

    if (data.promptFeedback?.blockReason) {
      throw new Error(
        `The AI declined to generate this course (${data.promptFeedback.blockReason}).`,
      );
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
    if (!text) throw new Error("The AI returned an empty response.");

    return JSON.parse(text) as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Call Gemini with retries (busy / rate-limited) and a lighter fallback model.
 * Throws an Error with a learner-friendly message.
 */
async function callGemini(
  apiKey: string,
  parts: GeminiPart[],
  hasVideo = false,
  schema: object = courseSchema,
): Promise<Record<string, unknown>> {
  const models = [...new Set([GEMINI_MODEL, GEMINI_FALLBACK_MODEL])];
  const started = Date.now();
  const BUDGET_MS = 150_000; // never keep a learner waiting longer than ~2.5 min
  let last: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (Date.now() - started > BUDGET_MS) throw friendly(last);
      try {
        return await callGeminiOnce(model, apiKey, parts, hasVideo, schema);
      } catch (e) {
        last = e;
        console.warn(`Gemini ${model} attempt ${attempt + 1} failed:`, e instanceof Error ? e.message : e);
        if (e instanceof GeminiHttpError && RETRYABLE.has(e.status)) {
          if (attempt < 2) await sleep(1500 * 2 ** attempt + Math.random() * 500);
          continue;
        }
        if (e instanceof GeminiHttpError && e.status === 404) break; // model unavailable → fallback
        if (e instanceof SyntaxError) continue; // malformed JSON → try again
        throw friendly(e);
      }
    }
  }
  throw friendly(last);
}

function friendly(e: unknown): Error {
  if (e instanceof GeminiHttpError) {
    if (e.status === 429) return new Error("The AI is rate-limited right now (free tier). Wait a minute and try again.");
    if (RETRYABLE.has(e.status)) return new Error("The AI is overloaded right now. Your sources are still here, so try again in a minute. Long videos are the heaviest; removing one can help.");
    if (e.status === 400) return new Error("The AI couldn't read one of your sources (a video or file may be private, too long, or unsupported). Try removing it.");
    if (e.status === 403) return new Error("The AI key was rejected. Check GEMINI_API_KEY in .env.local.");
    return new Error(`The AI request failed (${e.status}). Please try again.`);
  }
  if (e instanceof Error && e.name === "AbortError") {
    return new Error("The AI took too long. Try fewer or shorter sources.");
  }
  return e instanceof Error ? e : new Error("Unknown error.");
}

/* ------------------------------------------------------------------ */
/*  Public entry point.                                                */
/* ------------------------------------------------------------------ */

/** Download a public PDF (≤ 20 MB) so it can be sent inline to the AI. */
async function fetchPdfInline(url: string): Promise<GeminiPart | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: controller.signal });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_PDF_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_PDF_BYTES || buf.subarray(0, 5).toString() !== "%PDF-") return null;
    return { inlineData: { data: buf.toString("base64"), mimeType: "application/pdf" } };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function mediaParts(sources: ShelfSource[]): Promise<GeminiPart[]> {
  const parts = await Promise.all(
    sources.map(async (src): Promise<GeminiPart | null> => {
      if (src.file) return { fileData: { fileUri: src.file.uri, mimeType: src.file.mimeType } };
      if (src.kind === "video" && src.url) return { fileData: { fileUri: src.url } };
      if (src.kind === "paper" && src.url && /\.pdf($|\?)/i.test(src.url)) return fetchPdfInline(src.url);
      return null;
    }),
  );
  return parts.filter((p): p is GeminiPart => p !== null);
}

/** Generate one course from everything on the learner's Source shelf. */
export async function generateCourseFromSources(
  sources: ShelfSource[],
  focus = "",
): Promise<GenResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Course generation isn't configured yet. Add a free GEMINI_API_KEY to .env.local (get one at aistudio.google.com) and restart the dev server.",
    };
  }
  if (sources.length === 0) return { ok: false, error: "Add at least one source." };

  const media = await mediaParts(sources);
  const parts: GeminiPart[] = [...media, { text: buildInstruction(sources, focus) }];

  let raw: Record<string, unknown>;
  try {
    raw = await callGemini(apiKey, parts, sources.some((s) => s.kind === "video"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error.";
    return { ok: false, error: msg };
  }

  const first = sources.find((s) => s.url) ?? sources[0];
  return shapeCourse(raw, first.url ?? "", first.title, sources);
}

/** Back-compat: a single pasted course link. */
export async function generateCourseFromUrl(rawUrl: string): Promise<GenResult> {
  const url = normalizeUrl(rawUrl);
  if (!url) {
    return {
      ok: false,
      error: "That doesn't look like a valid public course link. Paste a full https:// URL.",
    };
  }
  const page = await fetchPage(url);
  return generateCourseFromSources([
    {
      id: "single",
      kind: "course",
      title: page?.title || url,
      url,
      text: page?.text,
      quality: page?.text ? "ready" : "partial",
    },
  ]);
}

function shapeCourse(
  raw: Record<string, unknown>,
  url: string,
  sourceTitle: string,
  shelf: ShelfSource[],
): GenResult {
  const promptsRaw = (raw.prompts ?? {}) as Partial<PromptVariants>;
  const claude = typeof promptsRaw.claude === "string" ? promptsRaw.claude : "";
  if (!claude.trim()) {
    return {
      ok: false,
      error: "The AI couldn't build a usable course from that. Try adding more detailed sources.",
    };
  }

  const sources = Array.isArray(raw.sources)
    ? (raw.sources as unknown[])
        .filter((s): s is GenSource => {
          const o = s as GenSource;
          return !!o && typeof o.name === "string" && typeof o.note === "string";
        })
        .slice(0, 5)
    : [];

  const syllabus = Array.isArray(raw.syllabus)
    ? (raw.syllabus as unknown[])
        .map((m, i) => {
          const o = (m ?? {}) as Partial<GenSyllabusItem>;
          return {
            n: typeof o.n === "string" ? o.n : String(i).padStart(2, "0"),
            module: typeof o.module === "string" ? o.module : `Module ${i + 1}`,
            source: typeof o.source === "string" && o.source ? o.source : undefined,
            covers: typeof o.covers === "string" ? o.covers : "",
            gate: typeof o.gate === "string" ? o.gate : "",
          } satisfies GenSyllabusItem;
        })
        .slice(0, 10)
    : [];

  const str = (v: unknown, fallback = ""): string =>
    typeof v === "string" && v.trim() ? v : fallback;

  const course: GeneratedCourse = {
    title: str(raw.title, "Your generated course"),
    icon: str(raw.icon, "🎓"),
    color: coerceColor(raw.color),
    kicker: str(raw.kicker, "course"),
    category: str(raw.category, "General"),
    oneLiner: str(raw.oneLiner),
    blurb: str(raw.blurb),
    duration: str(raw.duration, "Self-paced"),
    level: str(raw.level, "All levels"),
    outcomes: asStringArray(raw.outcomes).slice(0, 8),
    sources,
    syllabus,
    graduation: str(raw.graduation),
    prompts: {
      claude,
      chatgpt: typeof promptsRaw.chatgpt === "string" && promptsRaw.chatgpt.trim()
        ? promptsRaw.chatgpt
        : claude,
      gemini: typeof promptsRaw.gemini === "string" && promptsRaw.gemini.trim()
        ? promptsRaw.gemini
        : claude,
    },
    sourceUrl: url,
    sourceTitle,
    builtFrom: shelf.map((x) => ({ kind: x.kind, title: x.title, subtitle: x.subtitle, url: x.url })),
  };

  return { ok: true, course };
}

/** Structured JSON from Gemini with the same retries/fallback/friendly errors. */
export async function generateStructured(
  prompt: string,
  schema: object,
): Promise<Record<string, unknown>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("The AI isn't configured (GEMINI_API_KEY missing).");
  return callGemini(apiKey, [{ text: prompt }], false, schema);
}
