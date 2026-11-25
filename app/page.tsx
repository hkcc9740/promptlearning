import Link from "next/link";
import { auth } from "@/auth";
import { getPublishedCourses } from "@/lib/courses";
import { CourseCard } from "@/components/course-card";
import { CourseGenerator } from "@/components/course-generator";
import { NotionTag } from "@/components/notion-tag";

export default async function HomePage() {
  const session = await auth();
  const courses = getPublishedCourses();
  const signedIn = Boolean(session?.user);
  const primaryHref = signedIn ? "/courses" : "/signin";

  return (
    <>
      {/* ---------------- HERO ---------------- */}
      <section className="wrap pt-16 pb-14 sm:pt-24 sm:pb-16">
        <p className="text-xl sm:text-2xl text-muted mb-5">
          <span aria-hidden>✌️</span> Learn anything, one prompt at a time.
        </p>
        <h1 className="text-[2.9rem] leading-[1.02] sm:text-[4.5rem] max-w-4xl">
          Turn any chat into your personal classroom.
        </h1>

        {/* colorful Notion-tag cluster */}
        <div className="relative mt-8 flex flex-wrap gap-2.5 max-w-2xl">
          <NotionTag color="green" large style={{ transform: "rotate(-3deg)" }}>🎓 business</NotionTag>
          <NotionTag color="yellow" large style={{ transform: "rotate(2deg)" }}>💸 finance</NotionTag>
          <NotionTag color="purple" large style={{ transform: "rotate(-2deg)" }}>♟️ strategy</NotionTag>
          <NotionTag color="blue" large style={{ transform: "rotate(4deg)" }}>🤖 AI agents</NotionTag>
          <NotionTag color="orange" large style={{ transform: "rotate(-4deg)" }}>📣 marketing</NotionTag>
          <NotionTag color="pink" large style={{ transform: "rotate(3deg)" }}>🚀 startups</NotionTag>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-3">
          <Link href={primaryHref} className="btn btn-primary">
            Get started — it’s free
          </Link>
          <Link href="/courses" className="btn btn-ghost">
            Browse courses
          </Link>
        </div>
      </section>

      {/* ---------------- GENERATE FROM A LINK ---------------- */}
      <section id="generate" className="wrap pb-16 -mt-2 scroll-mt-8">
        <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
          <h2 className="text-3xl sm:text-4xl">Generate your own</h2>
          <p className="text-sm text-muted max-w-sm">
            Found something worth learning? Books, papers, videos, links: turn them into a course you can run.
          </p>
        </div>
        <CourseGenerator
          signedIn={signedIn}
          signInHref={`/signin?next=${encodeURIComponent("/")}`}
        />
      </section>

      {/* ---------------- COURSE CATALOG ---------------- */}
      <section className="wrap pb-20 pt-4">
        <div className="flex items-baseline justify-between flex-wrap gap-4 mb-8">
          <h2 className="text-3xl sm:text-4xl">Courses</h2>
          <Link href="/courses" className="link-accent text-sm">
            See all →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
            <CourseCard key={course.slug} course={course} />
          ))}
        </div>
      </section>

      {/* ---------------- WHY DIFFERENT (bottom) ---------------- */}
      <section className="border-t border-line bg-bg-2">
        <div className="wrap py-20">
          <h2 className="text-3xl sm:text-4xl max-w-2xl mb-12">
            A video can’t meet you where you are. This does.
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                e: "📚",
                h: "From the real sources",
                p: "Not made up on the spot. Each course is distilled from the best free teaching on earth — Damodaran on finance, Porter on strategy, YC on startups — and cites where every idea comes from.",
              },
              {
                e: "🎚️",
                h: "Adapts to you",
                p: "Ask it to dumb a concept down, go deeper, switch languages, or use your own example. It reshapes the lesson to exactly your level — a fixed video never will.",
              },
              {
                e: "🏅",
                h: "You graduate with proof",
                p: "Every course ends in a project applied to something real to you, plus a share-ready one-pager you keep. You get caught if you didn’t actually get it.",
              },
            ].map((c) => (
              <div key={c.h} className="card p-7">
                <div className="text-3xl mb-4" aria-hidden>{c.e}</div>
                <h3 className="text-xl font-semibold mb-2">{c.h}</h3>
                <p className="text-[0.95rem] text-ink-2 leading-relaxed">{c.p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
