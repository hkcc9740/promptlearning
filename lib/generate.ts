// Server-only: this module reads GEMINI_API_KEY and makes outbound fetches.
// It must only ever be imported from Server Actions / Route Handlers / Server
// Components — never from a "use client" module.
import type { NotionColor } from "@/components/notion-tag";
import type { PromptVariants } from "@/lib/courses";

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

const GEMINI_MODEL = "gemini-2.5-flash";

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

type PageContent = { title: string; text: string };

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

async function fetchPage(url: string): Promise<PageContent | null> {
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

function buildInstruction(url: string, page: PageContent | null): string {
  const pageBlock = page
    ? `PAGE TITLE: ${page.title || "(none)"}\n\nPAGE CONTENT (scraped, may be noisy/truncated):\n${page.text}`
    : `The page could not be fetched. Use the URL itself and your own knowledge of this course/topic.`;

  return `You are the curriculum designer for "Prompt Learning", a site that turns any
topic into a self-running, interactive course a learner pastes into an AI chat
(Claude, ChatGPT, or Gemini). A learner pasted this course link:

${url}

${pageBlock}

Design a single Prompt-Learning course that teaches the SUBJECT of that page —
not a summary of the page, but a real course on the topic, distilled from the
best teachers and primary sources on earth (cite real experts/books/institutions
relevant to the subject in "sources"; never invent fake citations).

Rules:
- "icon": exactly one emoji that fits the subject.
- "color": one of ${NOTION_COLORS.join(", ")} that matches the vibe.
- "kicker": 1–3 word category label (e.g. "finance", "AI agents").
- "oneLiner": one punchy sentence for a catalog card.
- "blurb": 1–2 sentences, who it's for and what they'll be able to do.
- "duration": e.g. "~3 hours, self-paced". "level": e.g. "Beginner → Intermediate".
- "outcomes": 4–6 concrete things the learner will be able to DO afterward.
- "sources": 2–4 real, reputable sources (name + one-line note on what it gives).
- "syllabus": 5–8 modules. "n" is a zero-padded marker "00","01",… "module" is
  the title. "source" (optional) names where that module's ideas come from.
  "covers" is 1–2 sentences. "gate" is a short check question the learner must
  answer correctly before moving on.
- "graduation": the final real-world project + a share-ready one-pager they keep.
- "prompts": for EACH of claude, chatgpt, gemini, a COMPLETE, self-contained
  system prompt the learner pastes into that AI so it runs this entire course
  interactively — it should adopt the professor persona, teach module by module
  using the syllabus, adapt to the learner's level, enforce the gates, and end
  with the graduation project. Make it long and genuinely usable (not a stub).
  Tailor each variant's phrasing to that assistant; "claude" is the reference.

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

async function callGemini(
  apiKey: string,
  instruction: string,
): Promise<Record<string, unknown>> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: instruction }] }],
        generationConfig: {
          temperature: 0.65,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: courseSchema,
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Gemini request failed (${res.status}). ${detail.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      promptFeedback?: { blockReason?: string };
    };

    if (data.promptFeedback?.blockReason) {
      throw new Error(
        `The AI declined to generate this course (${data.promptFeedback.blockReason}).`,
      );
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("");
    if (!text) throw new Error("The AI returned an empty response.");

    return JSON.parse(text) as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

/* ------------------------------------------------------------------ */
/*  Public entry point.                                                */
/* ------------------------------------------------------------------ */

export async function generateCourseFromUrl(rawUrl: string): Promise<GenResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Course generation isn't configured yet. Add a free GEMINI_API_KEY to .env.local (get one at aistudio.google.com) and restart the dev server.",
    };
  }

  const url = normalizeUrl(rawUrl);
  if (!url) {
    return {
      ok: false,
      error: "That doesn't look like a valid public course link. Paste a full https:// URL.",
    };
  }

  const page = await fetchPage(url);

  let raw: Record<string, unknown>;
  try {
    raw = await callGemini(apiKey, buildInstruction(url, page));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error.";
    return { ok: false, error: msg };
  }

  const promptsRaw = (raw.prompts ?? {}) as Partial<PromptVariants>;
  const claude = typeof promptsRaw.claude === "string" ? promptsRaw.claude : "";
  if (!claude.trim()) {
    return {
      ok: false,
      error: "The AI couldn't build a usable course from that link. Try a more detailed course page.",
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
    sourceTitle: page?.title ?? url,
  };

  return { ok: true, course };
}
