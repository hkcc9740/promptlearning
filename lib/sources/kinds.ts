// Source kinds + classification. Pure — safe in client and server code.

export type SourceKind = "course" | "book" | "paper" | "video" | "post" | "article";

/** Display groups on the Source shelf, in this order. */
export const SOURCE_GROUPS: { kind: SourceKind; icon: string; label: string }[] = [
  { kind: "book", icon: "📖", label: "Books" },
  { kind: "course", icon: "🎓", label: "Courses" },
  { kind: "paper", icon: "📄", label: "Papers & PDFs" },
  { kind: "video", icon: "▶️", label: "Videos" },
  { kind: "post", icon: "🐦", label: "Posts & threads" },
  { kind: "article", icon: "🔗", label: "Articles & web" },
];

export const MAX_SOURCES = 10;
/** PDFs fetched from a link server-side (sent inline to the AI). */
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
/** PDFs uploaded from the browser: Vercel caps function request bodies at 4.5 MB. */
export const MAX_UPLOAD_PDF_BYTES = 4 * 1024 * 1024;

/** A source the learner added, as kept on the client and sent to generation. */
export type ShelfSource = {
  id: string;
  kind: SourceKind;
  title: string;
  subtitle?: string;
  url?: string;
  /** Extracted text (pages, posts, abstracts). Trimmed again server-side. */
  text?: string;
  /** Gemini Files API reference for uploaded PDFs. */
  file?: { uri: string; mimeType: string };
  /** Book metadata from Open Library. */
  book?: { authors: string[]; year?: number; subjects?: string[]; coverUrl?: string };
  /** "ready" = we have its content; "partial" = title/metadata only, AI fills in. */
  quality: "ready" | "partial";
};

const COURSE_HOSTS = [
  "coursera.org", "udemy.com", "edx.org", "khanacademy.org", "skillshare.com",
  "linkedin.com/learning", "udacity.com", "ocw.mit.edu", "futurelearn.com",
  "pluralsight.com", "domestika.org", "masterclass.com", "online.stanford.edu",
];
const VIDEO_HOSTS = ["youtube.com", "youtu.be", "m.youtube.com"];
const POST_HOSTS = ["x.com", "twitter.com", "threads.net", "threads.com", "bsky.app", "mastodon.social"];
const PAPER_HOSTS = [
  "arxiv.org", "doi.org", "semanticscholar.org", "pubmed.ncbi.nlm.nih.gov", "ncbi.nlm.nih.gov",
  "biorxiv.org", "medrxiv.org", "ssrn.com", "papers.ssrn.com", "researchgate.net",
  "scholar.google.com", "nature.com", "science.org", "jstor.org", "openreview.net", "aclanthology.org",
];
const BOOK_HOSTS = ["goodreads.com", "openlibrary.org", "books.google.com", "amazon.com/dp", "amazon.co.uk/dp"];

export type Classified =
  | { type: "url"; kind: SourceKind; url: string }
  | { type: "isbn"; isbn: string }
  | { type: "search"; query: string };

function hostMatches(u: URL, list: string[]): boolean {
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const hp = host + u.pathname.toLowerCase();
  return list.some((h) => (h.includes("/") ? hp.startsWith(h) : host === h || host.endsWith(`.${h}`)));
}

export function classifySource(raw: string): Classified | null {
  const input = raw.trim();
  if (!input) return null;

  const digits = input.replace(/[-\s]/g, "");
  if (/^(97[89])?\d{9}[\dXx]$/.test(digits)) return { type: "isbn", isbn: digits.toUpperCase() };

  const looksLikeUrl = /^https?:\/\//i.test(input) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(input);
  if (!looksLikeUrl || /\s/.test(input)) return { type: "search", query: input.slice(0, 200) };

  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { type: "search", query: input.slice(0, 200) };
  }
  const url = u.toString();
  if (hostMatches(u, VIDEO_HOSTS)) return { type: "url", kind: "video", url };
  if (hostMatches(u, POST_HOSTS)) return { type: "url", kind: "post", url };
  if (hostMatches(u, PAPER_HOSTS) || /\.pdf($|\?)/i.test(u.pathname)) return { type: "url", kind: "paper", url };
  if (hostMatches(u, BOOK_HOSTS)) return { type: "url", kind: "book", url };
  if (hostMatches(u, COURSE_HOSTS) || /\/(course|courses|learn|class)\b/i.test(u.pathname)) {
    return { type: "url", kind: "course", url };
  }
  return { type: "url", kind: "article", url };
}

export function groupOf(kind: SourceKind) {
  return SOURCE_GROUPS.find((g) => g.kind === kind)!;
}
