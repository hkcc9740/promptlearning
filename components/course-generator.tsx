"use client";

import Link from "next/link";
import { useState } from "react";
import { generateCourseAction } from "@/app/actions/generate-course";
import type { GeneratedCourse } from "@/lib/generate";
import { NotionTag } from "@/components/notion-tag";
import { PromptPanel } from "@/components/prompt-panel";

type Props = {
  signedIn: boolean;
  signInHref: string;
};

const LOADING_STEPS = [
  "Reading the course page…",
  "Finding the real sources…",
  "Designing your syllabus…",
  "Writing your run-it-yourself prompt…",
];

export function CourseGenerator({ signedIn, signInHref }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [course, setCourse] = useState<GeneratedCourse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signedIn || loading || !url.trim()) return;

    setLoading(true);
    setError(null);
    setCourse(null);

    try {
      const result = await generateCourseAction(url);
      if (result.ok) {
        setCourse(result.course);
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
        <div className="flex items-center gap-2 mb-3">
          <NotionTag color="blue">✨ new</NotionTag>
          <span className="text-sm text-muted">
            Paste a course link — Coursera, Udemy, any course page
          </span>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={!signedIn || loading}
            placeholder="https://www.coursera.org/learn/…"
            aria-label="Course link"
            className="flex-1 min-w-0 rounded-[var(--radius)] border border-line bg-white px-4 py-3 text-base outline-none transition-colors focus:border-ink disabled:opacity-60"
          />
          {signedIn ? (
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="btn btn-primary shrink-0 disabled:opacity-60"
            >
              {loading ? "Generating…" : "Generate course"}
            </button>
          ) : (
            <Link href={signInHref} className="btn btn-primary shrink-0 text-center">
              Sign in to generate
            </Link>
          )}
        </form>

        {!signedIn && (
          <p className="mt-3 text-sm text-muted">
            Free — one sign-in unlocks generating and every course.
          </p>
        )}

        {loading && <LoadingState />}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-[var(--radius)] border border-line bg-bg-2 px-4 py-3 text-sm text-ink-2"
          >
            {error}
          </div>
        )}
      </div>

      {course && (
        <div className="mt-8">
          <GeneratedCourseView course={course} signInHref={signInHref} />
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mt-5 flex items-center gap-3 text-sm text-ink-2">
      <Spinner />
      <span className="animate-pulse">
        {LOADING_STEPS[Math.floor(Date.now() / 1500) % LOADING_STEPS.length]}
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

/* ------------------------------------------------------------------ */
/*  Inline rendering of a freshly generated course.                    */
/*  Mirrors app/courses/[slug]/page.tsx so it feels native.            */
/* ------------------------------------------------------------------ */

function GeneratedCourseView({
  course,
  signInHref,
}: {
  course: GeneratedCourse;
  signInHref: string;
}) {
  let sourceHost = "";
  try {
    sourceHost = new URL(course.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    sourceHost = course.sourceUrl;
  }

  return (
    <article className="card overflow-hidden">
      {/* header */}
      <div className="border-b border-line bg-bg-2 p-6 sm:p-8">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden>🎓</span>
          <span>
            Generated from{" "}
            <a
              href={course.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="link-accent"
            >
              {sourceHost}
            </a>
          </span>
        </div>

        <div
          className="mt-5 grid h-16 w-16 place-items-center rounded-2xl bg-white border border-line text-3xl"
          aria-hidden
        >
          {course.icon}
        </div>

        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <NotionTag color={course.color}>{course.kicker}</NotionTag>
          <span className="text-xs text-ink-2">{course.duration}</span>
          <span className="text-xs text-ink-2">· {course.level}</span>
        </div>

        <h3 className="mt-4 text-3xl sm:text-4xl max-w-3xl">{course.title}</h3>
        {course.blurb && (
          <p className="mt-3 text-lg text-ink-2 max-w-2xl leading-relaxed">
            {course.blurb}
          </p>
        )}
      </div>

      <div className="p-6 sm:p-8">
        <div className="grid lg:grid-cols-[1fr_380px] gap-10 lg:gap-12 items-start">
          {/* MAIN */}
          <div className="space-y-12 min-w-0">
            {course.outcomes.length > 0 && (
              <section>
                <h4 className="text-xl mb-4">What you’ll walk away knowing</h4>
                <ul className="space-y-3">
                  {course.outcomes.map((o) => (
                    <li key={o} className="flex gap-3 text-ink-2">
                      <span
                        aria-hidden
                        className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 bg-ink"
                      />
                      <span className="leading-relaxed">{o}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {course.sources.length > 0 && (
              <section>
                <span className="eyebrow mb-4 inline-block">Distilled from</span>
                <div className="card divide-y divide-line">
                  {course.sources.map((s) => (
                    <div
                      key={s.name}
                      className="flex items-baseline gap-4 px-5 py-3.5"
                    >
                      <span className="text-base font-semibold shrink-0">
                        {s.name}
                      </span>
                      <span className="text-sm text-muted">{s.note}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">
                  AI-selected sources — double-check anything before you rely on it.
                </p>
              </section>
            )}

            {course.syllabus.length > 0 && (
              <section>
                <h4 className="text-xl mb-4">The syllabus</h4>
                <div className="space-y-2.5">
                  {course.syllabus.map((m) => (
                    <details key={m.n} className="card group overflow-hidden">
                      <summary className="flex items-center gap-4 px-5 py-4 cursor-pointer list-none select-none">
                        <span className="font-mono text-sm text-muted tabular-nums">
                          {m.n}
                        </span>
                        <span className="text-base font-semibold flex-1">
                          {m.module}
                        </span>
                        {m.source && (
                          <span className="hidden sm:inline text-xs text-muted">
                            {m.source}
                          </span>
                        )}
                        <span
                          aria-hidden
                          className="text-muted transition-transform group-open:rotate-45 text-lg leading-none"
                        >
                          +
                        </span>
                      </summary>
                      <div className="px-5 pb-5 pl-[3.4rem] space-y-3">
                        {m.covers && (
                          <p className="text-sm text-ink-2 leading-relaxed">
                            {m.covers}
                          </p>
                        )}
                        {m.gate && (
                          <p className="text-sm">
                            <span className="font-mono text-xs uppercase tracking-wide text-muted">
                              Gate ·{" "}
                            </span>
                            <span className="text-ink-2">{m.gate}</span>
                          </p>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {course.graduation && (
              <section>
                <div className="rounded-[var(--radius)] p-7 bg-bg-2">
                  <span className="eyebrow mb-3 inline-block">🏅 Graduation</span>
                  <p className="text-xl font-semibold leading-snug max-w-xl">
                    {course.graduation}
                  </p>
                </div>
              </section>
            )}
          </div>

          {/* PROMPT PANEL — the runnable course */}
          <aside className="lg:sticky lg:top-8">
            <PromptPanel
              prompts={course.prompts}
              title={course.title}
              signedIn
              signInHref={signInHref}
            />
          </aside>
        </div>
      </div>
    </article>
  );
}
