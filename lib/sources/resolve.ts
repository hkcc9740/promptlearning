// Server-only: turn a pasted link / book search / ISBN into a ShelfSource.
import { randomUUID } from "node:crypto";
import { fetchPage, normalizeUrl } from "@/lib/generate";
import { classifySource, type ShelfSource, type SourceKind } from "@/lib/sources/kinds";

const UA = "PromptLearning/0.1 (course generator)";
const TEXT_CAP = 8000;

async function getJson<T>(url: string, ms = 8000): Promise<T | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "User-Agent": UA, Accept: "application/json" } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function getText(url: string, ms = 8000): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { "User-Agent": UA } });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const stripTags = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&mdash;/g, "—").replace(/\s+/g, " ").trim();

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function base(kind: SourceKind, title: string, extra: Partial<ShelfSource> = {}): ShelfSource {
  return { id: randomUUID(), kind, title: title.slice(0, 300) || "Untitled", quality: "partial", ...extra };
}

/* ---------------- books (Open Library) ---------------- */

type OLDoc = {
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
};

function bookFromDoc(d: OLDoc): ShelfSource {
  const authors = (d.author_name ?? []).slice(0, 3);
  return base("book", d.title ?? "Untitled", {
    subtitle: [authors.join(", "), d.first_publish_year].filter(Boolean).join(" · ") || undefined,
    book: {
      authors,
      year: d.first_publish_year,
      subjects: (d.subject ?? []).slice(0, 8),
      coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
    },
    // The AI teaches books from what it knows; we never fetch book text.
    quality: "ready",
  });
}

export async function searchBooks(query: string): Promise<ShelfSource[]> {
  const q = query.trim().slice(0, 200);
  if (q.length < 2) return [];
  const data = await getJson<{ docs?: OLDoc[] }>(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=6&fields=title,author_name,first_publish_year,cover_i,subject`,
  );
  return (data?.docs ?? []).filter((d) => d.title).map(bookFromDoc);
}

async function bookByIsbn(isbn: string): Promise<ShelfSource | null> {
  const [first] = await searchBooks(`isbn:${isbn}`);
  return first ?? null;
}

/* ---------------- per-kind URL resolvers ---------------- */

async function resolvePage(kind: SourceKind, url: string): Promise<ShelfSource> {
  const page = await fetchPage(url);
  const title = page?.title?.trim() || hostOf(url);
  const text = page?.text?.slice(0, TEXT_CAP);
  return base(kind, title, {
    url,
    subtitle: hostOf(url),
    text,
    quality: text && text.length > 400 ? "ready" : "partial",
  });
}

async function resolveVideo(url: string): Promise<ShelfSource> {
  const o = await getJson<{ title?: string; author_name?: string }>(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  );
  return base("video", o?.title ?? "YouTube video", {
    url,
    subtitle: ["YouTube", o?.author_name].filter(Boolean).join(" · "),
    // Gemini watches public YouTube videos directly.
    quality: o ? "ready" : "partial",
  });
}

async function resolvePost(url: string): Promise<ShelfSource> {
  const u = new URL(url);
  if (/(^|\.)(x|twitter)\.com$/.test(u.hostname)) {
    const tweetUrl = url.replace(/\/\/(www\.)?x\.com/, "//twitter.com");
    const o = await getJson<{ html?: string; author_name?: string }>(
      `https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(tweetUrl)}`,
    );
    if (o?.html) {
      const text = stripTags(o.html).slice(0, TEXT_CAP);
      return base("post", `${o.author_name ?? "Post"}: ${text.slice(0, 80)}${text.length > 80 ? "…" : ""}`, {
        url,
        subtitle: `X · @${u.pathname.split("/")[1] ?? ""}`,
        text,
        quality: "ready",
      });
    }
    return base("post", `Post by @${u.pathname.split("/")[1] ?? "unknown"}`, { url, subtitle: "X" });
  }
  return resolvePage("post", url);
}

async function resolvePaper(url: string): Promise<ShelfSource> {
  const u = new URL(url);

  // arXiv: use the official API for title, authors and abstract.
  if (u.hostname.endsWith("arxiv.org")) {
    const id = u.pathname.replace(/^\/(abs|pdf|html)\//, "").replace(/\.pdf$/, "").replace(/v\d+$/, "");
    const xml = await getText(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`);
    const entry = xml?.split("<entry>")[1];
    if (entry) {
      const pick = (tag: string) => entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.replace(/\s+/g, " ").trim();
      const authors = [...entry.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1]).slice(0, 4);
      return base("paper", pick("title") ?? `arXiv ${id}`, {
        url: `https://arxiv.org/abs/${id}`,
        subtitle: ["arXiv", authors.join(", ")].filter(Boolean).join(" · "),
        text: `ABSTRACT: ${pick("summary") ?? ""}`.slice(0, TEXT_CAP),
        quality: "ready",
      });
    }
  }

  // Direct PDF link: the PDF itself is sent to the AI at generation time.
  if (/\.pdf($|\?)/i.test(u.pathname)) {
    const name = decodeURIComponent(u.pathname.split("/").pop() ?? "document.pdf");
    return base("paper", name, { url, subtitle: `PDF · ${hostOf(url)}`, quality: "ready" });
  }

  return resolvePage("paper", url);
}

async function resolveBookUrl(url: string): Promise<ShelfSource> {
  const isbn = url.match(/\/(?:dp|isbn|product)\/(\d{9}[\dX]|\d{13})/i)?.[1];
  if (isbn) {
    const b = await bookByIsbn(isbn);
    if (b) return { ...b, url };
  }
  const page = await fetchPage(url);
  const title = page?.title?.replace(/\s*[|:-]\s*(Goodreads|Amazon\.com|Open Library).*$/i, "").trim();
  if (title) {
    const [match] = await searchBooks(title);
    if (match) return { ...match, url };
  }
  return base("book", title || hostOf(url), { url, subtitle: hostOf(url) });
}

/* ---------------- entry point ---------------- */

export type ResolveResult =
  | { type: "source"; source: ShelfSource }
  | { type: "candidates"; candidates: ShelfSource[] }
  | { type: "error"; error: string };

export async function resolveInput(input: string): Promise<ResolveResult> {
  const c = classifySource(input);
  if (!c) return { type: "error", error: "Paste a link, or type a book title." };

  if (c.type === "search") {
    const candidates = await searchBooks(c.query);
    return candidates.length
      ? { type: "candidates", candidates }
      : { type: "error", error: `No books found for “${c.query}”. Try a link instead?` };
  }
  if (c.type === "isbn") {
    const b = await bookByIsbn(c.isbn);
    return b ? { type: "source", source: b } : { type: "error", error: "No book found for that ISBN." };
  }

  const url = normalizeUrl(c.url);
  if (!url) return { type: "error", error: "That link isn't a public web address." };

  const source =
    c.kind === "video" ? await resolveVideo(url)
    : c.kind === "post" ? await resolvePost(url)
    : c.kind === "paper" ? await resolvePaper(url)
    : c.kind === "book" ? await resolveBookUrl(url)
    : await resolvePage(c.kind, url);
  return { type: "source", source };
}
