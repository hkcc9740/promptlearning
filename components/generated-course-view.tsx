import type { GeneratedCourse } from "@/lib/generate";
import { groupOf } from "@/lib/sources/kinds";
import { CourseIcon } from "@/components/course-icon";
import { NotionTag } from "@/components/notion-tag";
import { PromptPanel } from "@/components/prompt-panel";

/* ------------------------------------------------------------------ */
/*  A generated course (inline after generating, or its own page).                 */
/*  Mirrors app/courses/[slug]/page.tsx so it feels native.            */
/* ------------------------------------------------------------------ */

export function GeneratedCourseView({
  course,
  signInHref,
  titleAs: Title = "h3",
  notice,
  aside,
  imageUrl,
  identity,
}: {
  course: GeneratedCourse;
  signInHref: string;
  /** h1 on its own page, h3 when shown inline under the generator. */
  titleAs?: "h1" | "h3";
  /** Optional strip under the header (e.g. "Saved to your library"). */
  notice?: React.ReactNode;
  /** Replaces the default prompt panel in the sidebar. */
  aside?: React.ReactNode;
  /** Custom course image (data URL) chosen by the learner. */
  imageUrl?: string | null;
  /** Replaces the icon + title block (e.g. with an editor on the owner's page). */
  identity?: React.ReactNode;
}) {
  let sourceHost = "";
  try {
    sourceHost = new URL(course.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    sourceHost = course.sourceUrl;
  }
  const builtFrom = course.builtFrom ?? [];

  return (
    <article className="card overflow-hidden">
      {/* header */}
      <div className="border-b border-line bg-bg-2 p-6 sm:p-8">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span aria-hidden>🎓</span>
          {builtFrom.length > 1 ? (
            <span>Built from {builtFrom.length} of your sources</span>
          ) : sourceHost ? (
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
          ) : (
            <span>Generated from {builtFrom[0]?.title ?? "your source"}</span>
          )}
        </div>

        {identity ?? (
          <div className="mt-5">
            <CourseIcon icon={course.icon} imageUrl={imageUrl} size="lg" />
          </div>
        )}

        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <NotionTag color={course.color}>{course.kicker}</NotionTag>
          <span className="text-xs text-ink-2">{course.duration}</span>
          <span className="text-xs text-ink-2">· {course.level}</span>
        </div>

        {!identity && (
          <Title className="mt-4 text-3xl sm:text-4xl max-w-3xl">{course.title}</Title>
        )}
        {course.blurb && (
          <p className="mt-3 text-lg text-ink-2 max-w-2xl leading-relaxed">
            {course.blurb}
          </p>
        )}
      </div>

      {notice}

      <div className="p-6 sm:p-8">
        <div className="grid lg:grid-cols-[1fr_380px] gap-10 lg:gap-12 items-start">
          {/* MAIN */}
          <div className="space-y-12 min-w-0">
            {builtFrom.length > 1 && (
              <section>
                <span className="eyebrow mb-4 inline-block">Built from your sources</span>
                <ul className="card divide-y divide-line">
                  {builtFrom.map((b, i) => (
                    <li key={`${b.title}-${i}`} className="flex items-center gap-3 px-5 py-3 text-sm">
                      <span aria-hidden>{groupOf(b.kind).icon}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {b.url ? (
                          <a href={b.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {b.title}
                          </a>
                        ) : (
                          b.title
                        )}
                      </span>
                      {b.subtitle && <span className="hidden sm:inline text-xs text-muted truncate max-w-[40%]">{b.subtitle}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

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
                    <div key={s.name} className="px-5 py-3.5 min-w-0">
                      <p className="text-base font-semibold leading-snug">{s.name}</p>
                      {s.note && (
                        <p className="mt-1 text-sm text-muted leading-relaxed">{s.note}</p>
                      )}
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
                        <span className="font-mono text-sm text-muted tabular-nums shrink-0">
                          {m.n}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-base font-semibold leading-snug">
                            {m.module}
                          </span>
                          {m.source && (
                            <span className="mt-0.5 block text-xs text-muted truncate">
                              {m.source}
                            </span>
                          )}
                        </span>
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
            {aside ?? (
              <PromptPanel
                prompts={course.prompts}
                title={course.title}
                signedIn
                signInHref={signInHref}
              />
            )}
          </aside>
        </div>
      </div>
    </article>
  );
}
