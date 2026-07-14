import Link from "next/link";
import type { Course } from "@/lib/courses";
import { NotionTag } from "@/components/notion-tag";

export function CourseCard({ course }: { course: Course }) {
  const shown = course.badges.slice(0, 6);
  const extra = course.badges.length - shown.length;

  return (
    <Link
      href={`/courses/${course.slug}`}
      className="card group flex flex-col p-7 transition-all duration-200 hover:shadow-[var(--shadow)] hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between mb-6">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-bg-2 text-3xl">
          <span aria-hidden>{course.icon}</span>
        </div>
        <NotionTag color={course.color}>{course.kicker}</NotionTag>
      </div>

      <h3 className="text-2xl font-semibold tracking-tight mb-2">{course.title}</h3>
      <p className="text-[0.95rem] text-ink-2 leading-relaxed mb-6 flex-1">
        {course.oneLiner}
      </p>

      {course.badges.length > 0 && (
        <div className="mb-6">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted mb-2">
            Distilled from
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {shown.map((b) => (
              <span
                key={b.label}
                className="inline-flex h-7 items-center rounded-lg border border-line bg-white px-2 text-[0.72rem] font-semibold text-ink-2 shadow-[var(--shadow-sm)]"
              >
                {b.label}
              </span>
            ))}
            {extra > 0 && (
              <span className="text-[0.72rem] text-muted">+{extra} more</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{course.duration}</span>
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          Start course
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
