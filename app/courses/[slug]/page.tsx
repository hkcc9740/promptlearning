import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCourse, getPublishedCourses } from "@/lib/courses";
import { CourseLearning } from "@/components/course-learning";
import { getLearningState } from "@/lib/course-learning";
import { staticRef } from "@/lib/enrollments";
import { getSessionUser } from "@/lib/session";
import { NotionTag } from "@/components/notion-tag";

export function generateStaticParams() {
  return getPublishedCourses().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = getCourse(slug);
  if (!course) return { title: "Course not found" };
  return { title: course.title, description: course.oneLiner };
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const course = getCourse(slug);
  if (!course) notFound();

  // Prompts are handed out by learning state (teaser / one lesson / whole course),
  // computed server-side so locked content never reaches the browser.
  const user = await getSessionUser();
  const ref = staticRef(course.slug);
  const state = await getLearningState(
    user,
    ref,
    course,
    `/signin?next=${encodeURIComponent(`/courses/${course.slug}`)}`,
  );

  return (
    <div>
      {/* header */}
      <div className="border-b border-line bg-bg-2">
        <div className="wrap py-14">
          <Link href="/courses" className="text-sm text-ink-2 hover:text-ink">
            ← All courses
          </Link>
          <div
            className="mt-8 grid h-16 w-16 place-items-center rounded-2xl bg-white border border-line text-3xl"
            aria-hidden
          >
            {course.icon}
          </div>
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <NotionTag color={course.color}>{course.kicker}</NotionTag>
            <span className="text-xs text-ink-2">{course.duration}</span>
            <span className="text-xs text-ink-2">· {course.level}</span>
          </div>
          <h1 className="mt-4 text-4xl sm:text-5xl max-w-3xl">{course.title}</h1>
          <p className="mt-4 text-lg text-ink-2 max-w-2xl leading-relaxed">
            {course.blurb}
          </p>
        </div>
      </div>

      <div className="wrap py-14">
        <div className="grid lg:grid-cols-[1fr_400px] gap-12 lg:gap-16 items-start">
          {/* MAIN */}
          <div className="space-y-14 min-w-0">
            {/* Outcomes */}
            <section>
              <h2 className="text-2xl mb-5">What you’ll walk away knowing</h2>
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

            {/* Provenance */}
            <section>
              <span className="eyebrow mb-4 inline-block">Distilled from</span>
              <div className="card divide-y divide-line">
                {course.sources.map((s) => (
                  <div key={s.name} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 px-5 py-3.5 min-w-0">
                    <span className="text-base font-semibold sm:shrink-0">{s.name}</span>
                    <span className="text-sm text-muted">{s.note}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted">
                Frameworks are taught and cited — the course points you to the real work.
              </p>
            </section>

            {/* Syllabus */}
            <section>
              <h2 className="text-2xl mb-5">The syllabus</h2>
              <div className="space-y-2.5">
                {course.syllabus.map((m) => (
                  <details key={m.n} className="card group overflow-hidden">
                    <summary className="flex items-center gap-4 px-5 py-4 cursor-pointer list-none select-none">
                      <span className="font-mono text-sm text-muted tabular-nums">{m.n}</span>
                      <span className="text-base font-semibold flex-1">{m.module}</span>
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
                      <p className="text-sm text-ink-2 leading-relaxed">{m.covers}</p>
                      <p className="text-sm">
                        <span className="font-mono text-xs uppercase tracking-wide text-muted">
                          Gate ·{" "}
                        </span>
                        <span className="text-ink-2">{m.gate}</span>
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            </section>

            {/* Graduation */}
            <section>
              <div className="rounded-[var(--radius)] p-7 bg-bg-2">
                <span className="eyebrow mb-3 inline-block">🏅 Graduation</span>
                <p className="text-xl font-semibold leading-snug max-w-xl">
                  {course.graduation}
                </p>
              </div>
            </section>
          </div>

          {/* STICKY PROMPT PANEL */}
          <aside className="lg:sticky lg:top-8">
            <CourseLearning
              courseRef={ref}
              title={course.title}
              modules={course.syllabus}
              state={state}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
