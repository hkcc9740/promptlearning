import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CourseIcon } from "@/components/course-icon";
import { NotionTag } from "@/components/notion-tag";
import { RemoveCourseButton } from "@/components/remove-course-button";
import { listMyCourses } from "@/lib/library";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "My library",
  description: "Every course you've generated, saved in one place.",
};

const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function LibraryPage() {
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent("/library")}`);

  const items = await listMyCourses(user.id);

  return (
    <div className="wrap py-16">
      <header className="max-w-2xl mb-10">
        <span className="eyebrow mb-4">My library</span>
        <h1 className="text-4xl sm:text-5xl mb-4">Courses you’ve generated.</h1>
        <p className="text-lg text-ink-2 leading-relaxed">
          Everything you build from a link is saved here, ready to run again.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-4xl mb-4" aria-hidden>🗂️</div>
          <p className="text-lg font-semibold mb-2">Nothing here yet</p>
          <p className="text-ink-2 mb-6">
            Paste any course link on the home page and it’ll land in your library.
          </p>
          <Link href="/#generate" className="btn btn-primary">
            Generate a course
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <article
              key={item.id}
              className="card group relative flex flex-col p-7 transition-all duration-200 hover:shadow-[var(--shadow)] hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between mb-6">
                <CourseIcon icon={item.icon} imageUrl={item.imageUrl} />
                <NotionTag color={item.course.color}>{item.course.kicker}</NotionTag>
              </div>

              <h2 className="text-2xl font-semibold tracking-tight mb-2">
                <Link
                  href={`/courses/g/${item.id}`}
                  className="after:absolute after:inset-0 after:content-['']"
                >
                  {item.title}
                </Link>
              </h2>
              <p className="text-[0.95rem] text-ink-2 leading-relaxed mb-6 flex-1">
                {item.course.oneLiner}
              </p>

              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted truncate">
                  {(item.course.builtFrom?.length ?? 0) > 1
                    ? `${item.course.builtFrom!.length} sources`
                    : hostOf(item.course.sourceUrl) || item.course.builtFrom?.[0]?.title}{" "}
                  · {dateFmt.format(item.createdAt)}
                </span>
                <RemoveCourseButton id={item.id} title={item.title} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
