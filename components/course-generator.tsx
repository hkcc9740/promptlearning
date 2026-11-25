"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { generateCourseAction } from "@/app/actions/generate-course";
import { resolveSourceAction, searchBooksAction } from "@/app/actions/sources";
import type { GeneratedCourse } from "@/lib/generate";
import {
  classifySource,
  MAX_PDF_BYTES,
  MAX_SOURCES,
  SOURCE_GROUPS,
  type ShelfSource,
} from "@/lib/sources/kinds";
import { NotionTag } from "@/components/notion-tag";
import { GeneratedCourseView } from "@/components/generated-course-view";

type Props = {
  signedIn: boolean;
  signInHref: string;
};

/** A shelf item, plus client-only loading/error state while it resolves. */
type Item = ShelfSource & { status?: "loading" | "error"; error?: string };

const LOADING_STEPS = [
  "Reading your sources…",
  "Connecting the big ideas…",
  "Designing your syllabus…",
  "Writing your lessons…",
];

const EXAMPLES = ["a YouTube talk", "an arXiv paper", "“Thinking, Fast and Slow”", "a tweet thread", "a PDF"];

export function CourseGenerator({ signedIn, signInHref }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [course, setCourse] = useState<GeneratedCourse | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const ready = items.filter((i) => !i.status);
  const busy = items.some((i) => i.status === "loading");
  const full = items.length >= MAX_SOURCES;

  const add = (item: Item) => setItems((xs) => [...xs, item]);
  const replace = (id: string, next: Item) => setItems((xs) => xs.map((x) => (x.id === id ? next : x)));
  const remove = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));

  async function addFromInput(input: string) {
    const c = classifySource(input);
    if (!c) return;
    const tempId = crypto.randomUUID();
    add({
      id: tempId,
      kind: c.type === "url" ? c.kind : "book",
      title: input,
      quality: "partial",
      status: "loading",
    });
    try {
      const res = await resolveSourceAction(input);
      if (res.type === "source") replace(tempId, res.source);
      else if (res.type === "candidates") replace(tempId, res.candidates[0]);
      else replace(tempId, { id: tempId, kind: "article", title: input, quality: "partial", status: "error", error: res.error });
    } catch {
      replace(tempId, { id: tempId, kind: "article", title: input, quality: "partial", status: "error", error: "Couldn’t read that. Try again?" });
    }
  }

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files).slice(0, MAX_SOURCES - items.length)) {
      const tempId = crypto.randomUUID();
      const placeholder: Item = { id: tempId, kind: "paper", title: file.name, quality: "partial", status: "loading" };
      if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
        add({ ...placeholder, status: "error", error: "Only PDF files for now." });
        continue;
      }
      if (file.size > MAX_PDF_BYTES) {
        add({ ...placeholder, status: "error", error: "PDFs can be up to 20 MB." });
        continue;
      }
      add(placeholder);
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/sources/upload", { method: "POST", body });
        const json = (await res.json()) as { source?: ShelfSource; error?: string };
        if (json.source) replace(tempId, json.source);
        else replace(tempId, { ...placeholder, status: "error", error: json.error ?? "Upload failed." });
      } catch {
        replace(tempId, { ...placeholder, status: "error", error: "Upload failed." });
      }
    }
  }

  async function onGenerate() {
    if (!signedIn || loading || ready.length === 0 || busy) return;
    setLoading(true);
    setError(null);
    setCourse(null);
    setSavedId(null);
    setSaveError(null);
    try {
      // Strip client-only fields before sending.
      const payload: ShelfSource[] = ready.map((it) => {
        const src: Item = { ...it };
        delete src.status;
        delete src.error;
        return src;
      });
      const result = await generateCourseAction(payload, focus);
      if (result.ok) {
        setCourse(result.course);
        setSavedId(result.savedId);
        setSaveError(result.saveError ?? null);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong generating the course. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="card p-6 sm:p-7">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <NotionTag color="blue">✨ new</NotionTag>
          <span className="text-sm text-muted">
            Turn anything into a course: links, books, papers, PDFs, videos, posts
          </span>
        </div>

        {signedIn ? (
          <SmartInput disabled={loading || full} onAddText={addFromInput} onAddFiles={addFiles} onPickBook={add} />
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 rounded-[var(--radius)] border border-line bg-white px-4 py-3 text-base text-muted">
              Paste a link, search a book, or drop a PDF…
            </div>
            <Link href={signInHref} className="btn btn-primary shrink-0 text-center">
              Sign in to start
            </Link>
          </div>
        )}

        {items.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Try: {EXAMPLES.join(" · ")}. Add up to {MAX_SOURCES}, mix and match.
          </p>
        ) : (
          <Shelf items={items} onRemove={remove} />
        )}

        {items.length > 0 && (
          <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center border-t border-line pt-5">
            <input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              maxLength={300}
              disabled={loading}
              placeholder="Focus (optional): e.g. “for making investing decisions”"
              aria-label="Course focus"
              className="flex-1 min-w-0 rounded-[var(--radius-sm)] border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-ink disabled:opacity-60"
            />
            <button
              type="button"
              onClick={onGenerate}
              disabled={loading || busy || ready.length === 0}
              className="btn btn-primary shrink-0 disabled:opacity-60"
            >
              {loading
                ? "Generating…"
                : busy
                  ? "Reading sources…"
                  : `Generate course${ready.length > 1 ? ` from ${ready.length} sources` : ""}`}
            </button>
          </div>
        )}

        {loading && <LoadingState />}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-[var(--radius)] border border-line bg-bg-2 px-4 py-3 text-sm text-ink-2"
          >
            {error}{" "}
            {/month/.test(error) && (
              <Link href="/pricing" className="link-accent">
                See plans →
              </Link>
            )}
          </div>
        )}
      </div>

      {course && (
        <div className="mt-8">
          <GeneratedCourseView
            course={course}
            signInHref={signInHref}
            notice={<SavedNotice savedId={savedId} saveError={saveError} />}
            aside={savedId ? <StartLessonsCta savedId={savedId} lessons={course.syllabus.length} /> : undefined}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Smart input: links/ISBNs on Enter, book search as you type, PDFs.  */
/* ------------------------------------------------------------------ */

function SmartInput({
  disabled,
  onAddText,
  onAddFiles,
  onPickBook,
}: {
  disabled: boolean;
  onAddText: (input: string) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onPickBook: (book: ShelfSource) => void;
}) {
  const [value, setValue] = useState("");
  const [books, setBooks] = useState<ShelfSource[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const kind = classifySource(value);
  const isSearch = kind?.type === "search" && value.trim().length >= 3;

  // Debounced book search while typing a title.
  useEffect(() => {
    if (!isSearch) return;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      const res = await searchBooksAction(value).catch(() => []);
      if (mine === seq.current) {
        setBooks(res);
        setActive(0);
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [value, isSearch]);

  const showBooks = isSearch && (books.length > 0 || searching);

  function reset() {
    seq.current++;
    setValue("");
    setBooks([]);
    setSearching(false);
  }

  function submit() {
    if (!value.trim() || disabled) return;
    if (isSearch && books[active]) onPickBook(books[active]);
    else onAddText(value);
    reset();
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled && e.dataTransfer.files.length) onAddFiles(e.dataTransfer.files);
      }}
      className={`relative rounded-[var(--radius)] transition-shadow ${dragging ? "ring-2 ring-ink ring-offset-2" : ""}`}
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (classifySource(e.target.value)?.type !== "search") setBooks([]);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (showBooks && e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, books.length - 1));
              } else if (showBooks && e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Escape") {
                setBooks([]);
              }
            }}
            disabled={disabled}
            placeholder={dragging ? "Drop your PDF here" : "Paste a link, search a book title, or drop a PDF…"}
            aria-label="Add a source"
            aria-expanded={showBooks}
            aria-controls="book-results"
            role="combobox"
            className="w-full rounded-[var(--radius)] border border-line bg-white pl-4 pr-12 py-3 text-base outline-none transition-colors focus:border-ink disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-lg text-lg text-ink-2 hover:bg-bg-2 disabled:opacity-60"
            aria-label="Upload a PDF"
            title="Upload a PDF"
          >
            📎
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) onAddFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {showBooks && (
            <ul
              id="book-results"
              role="listbox"
              className="absolute z-20 left-0 right-0 mt-2 card overflow-hidden shadow-[var(--shadow-lg)]"
            >
              <li className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted bg-bg-2">
                {searching && books.length === 0 ? "Searching books…" : "📖 Books"}
              </li>
              {books.map((b, i) => (
                <li
                  key={b.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPickBook(b);
                    reset();
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${i === active ? "bg-bg-2" : ""}`}
                >
                  <BookCover src={b.book?.coverUrl} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{b.title}</span>
                    {b.subtitle && <span className="block text-xs text-muted truncate">{b.subtitle}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="btn btn-dark shrink-0 disabled:opacity-60"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function BookCover({ src }: { src?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-10 w-7 shrink-0 rounded object-cover bg-bg-3" loading="lazy" />
  ) : (
    <span aria-hidden className="grid h-10 w-7 shrink-0 place-items-center rounded bg-bg-3 text-xs">📖</span>
  );
}

/* ------------------------------------------------------------------ */
/*  The shelf: everything added, grouped by type.                      */
/* ------------------------------------------------------------------ */

function Shelf({ items, onRemove }: { items: Item[]; onRemove: (id: string) => void }) {
  return (
    <div className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
        Your sources ({items.length}/{MAX_SOURCES})
      </p>
      <div className="rounded-[var(--radius-sm)] border border-line divide-y divide-line">
        {SOURCE_GROUPS.map((g) => {
          const group = items.filter((i) => i.kind === g.kind);
          if (group.length === 0) return null;
          return (
            <div key={g.kind} className="flex flex-col sm:flex-row gap-1 sm:gap-4 px-4 py-3">
              <span className="w-36 shrink-0 text-sm font-semibold text-ink-2">
                <span aria-hidden>{g.icon}</span> {g.label} ({group.length})
              </span>
              <ul className="flex-1 min-w-0 space-y-1.5">
                {group.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${it.status === "error" ? "text-muted line-through" : "text-ink"}`}>
                        {it.title}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {it.status === "loading"
                          ? "Reading…"
                          : it.status === "error"
                            ? `⚠ ${it.error}`
                            : [it.subtitle, it.quality === "partial" ? "title only: AI fills in the rest" : null]
                                .filter(Boolean)
                                .join(" · ")}
                      </span>
                    </span>
                    {it.status === "loading" ? (
                      <Spinner />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRemove(it.id)}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-bg-2 hover:text-ink"
                        aria-label={`Remove ${it.title}`}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LoadingState() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % LOADING_STEPS.length), 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mt-5 flex items-center gap-3 text-sm text-ink-2">
      <Spinner />
      <span className="animate-pulse">
        {LOADING_STEPS[step]}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="var(--line)"
        strokeWidth="2.5"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SavedNotice({
  savedId,
  saveError,
}: {
  savedId: string | null;
  saveError: string | null;
}) {
  if (savedId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 sm:px-8 py-3 text-sm">
        <span className="text-ink-2">
          <span aria-hidden>✓</span> Saved to your library
        </span>
        <span className="flex items-center gap-4">
          <Link href={`/courses/g/${savedId}`} className="link-accent">
            Open course page
          </Link>
          <Link href="/library" className="link-accent">
            My library →
          </Link>
        </span>
      </div>
    );
  }
  if (saveError) {
    return (
      <div className="border-b border-line px-6 sm:px-8 py-3 text-sm text-muted">
        {saveError}
      </div>
    );
  }
  return null;
}

function StartLessonsCta({ savedId, lessons }: { savedId: string; lessons: number }) {
  return (
    <div className="card p-6">
      <span className="eyebrow mb-3 inline-block">Your course is ready</span>
      <p className="text-lg font-semibold leading-snug mb-1">
        {lessons} lessons, one at a time
      </p>
      <p className="text-sm text-ink-2 mb-5">
        Each lesson is a short prompt you paste into your AI. Pass its gate, come back,
        and the next one unlocks.
      </p>
      <Link href={`/courses/g/${savedId}`} className="btn btn-primary w-full">
        Start lesson 1 →
      </Link>
    </div>
  );
}
